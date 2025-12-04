import { EventEmitter } from 'events';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Импорт protobuf (должен быть сгенерирован локально)
import { TunnelFrame, HttpRequest, HttpResponse, FrameType } from '../proto/tunnel_grpc_web_pb.js';

class LaptopGrpcClient {
  constructor(config) {
    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:3000',
      localAppUrl: config.localAppUrl || 'http://localhost:8000',
      reconnectInterval: config.reconnectInterval || 5000,
      ...config
    };
    
    this.clientId = null;
    this.tunnelId = null;
    this.stream = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.eventEmitter = new EventEmitter();
    this.pendingRequests = new Map();
  }
  
  async connect() {
    try {
      console.log(`🔗 Connecting to gRPC server: ${this.config.serverUrl}`);
      
      // Регистрация через gRPC-Web
      const registration = {
        client_id: this.generateClientId(),
        client_type: 0, // LAPTOP
        capabilities: ['HTTP_PROXY', 'GRPC_STREAM'],
        local_app_url: this.config.localAppUrl
      };
      
      const response = await fetch(`${this.config.serverUrl}/grpc/tunnel.TunnelService/Register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration)
      });
      
      const result = await response.json();
      
      if (result.success && result.data) {
        this.clientId = result.data.client_id;
        this.tunnelId = result.data.tunnel_id;
        
        console.log(`✅ Registered: ${this.clientId}`);
        console.log(`🔄 Tunnel ID: ${this.tunnelId}`);
        
        // Подключаемся к стриму
        await this.connectToStream();
        
        return true;
      }
      
      throw new Error('Registration failed');
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      this.scheduleReconnect();
      throw error;
    }
  }
  
  async connectToStream() {
    // Используем Server-Sent Events для стрима
    const streamUrl = `${this.config.serverUrl}/grpc/tunnel/stream?client_id=${this.clientId}`;
    
    console.log(`📡 Connecting to stream: ${streamUrl}`);
    
    try {
      const response = await fetch(streamUrl, {
        headers: { 'Accept': 'text/event-stream' }
      });
      
      if (!response.ok) {
        throw new Error(`Stream connection failed: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      this.stream = {
        reader,
        close: () => reader.cancel()
      };
      
      this.isConnected = true;
      
      // Чтение стрима
      this.readStream(reader, decoder);
      
      console.log('✅ Stream connected');
      
    } catch (error) {
      console.error('❌ Stream connection error:', error);
      throw error;
    }
  }
  
  async readStream(reader, decoder) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('🔌 Stream ended by server');
          this.handleDisconnection();
          break;
        }
        
        const chunk = decoder.decode(value);
        this.processStreamChunk(chunk);
      }
    } catch (error) {
      console.error('❌ Stream read error:', error);
      this.handleDisconnection();
    }
  }
  
  processStreamChunk(chunk) {
    // Обработка Server-Sent Events
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          this.handleIncomingFrame(data);
        } catch (error) {
          console.error('❌ Stream data parse error:', error);
        }
      }
    }
  }
  
  handleIncomingFrame(frameData) {
    try {
      const frame = new TunnelFrame(frameData);
      
      console.log(`📨 Frame received: ${FrameType[frame.type] || frame.type}`);
      
      switch(frame.type) {
        case FrameType.HTTP_REQUEST:
          this.handleHttpRequest(frame);
          break;
          
        case FrameType.PING:
          this.sendPong(frame.frame_id);
          break;
          
        case FrameType.DATA:
          console.log('📦 Data frame:', JSON.parse(frame.payload.toString()));
          break;
          
        default:
          console.warn(`⚠️ Unknown frame type: ${frame.type}`);
      }
      
    } catch (error) {
      console.error('❌ Frame handling error:', error);
    }
  }
  
  async handleHttpRequest(frame) {
    try {
      const httpRequest = new HttpRequest(JSON.parse(frame.payload.toString()));
      
      console.log(`📤 HTTP Request: ${httpRequest.method} ${httpRequest.path}`);
      
      // Выполняем запрос к локальному приложению
      const response = await this.forwardToLocalApp(httpRequest);
      
      // Отправляем ответ обратно
      await this.sendHttpResponse(response);
      
    } catch (error) {
      console.error('❌ HTTP request handling error:', error);
      
      // Отправляем ошибку
      const errorResponse = new HttpResponse({
        request_id: frame.metadata?.request_id,
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({
          error: 'Bad Gateway',
          message: error.message
        }))
      });
      
      await this.sendHttpResponse(errorResponse);
    }
  }
  
  async forwardToLocalApp(httpRequest) {
    const url = new URL(httpRequest.path, this.config.localAppUrl);
    
    // Добавляем query параметры
    if (httpRequest.query) {
      Object.entries(httpRequest.query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    
    const options = {
      method: httpRequest.method,
      headers: { ...httpRequest.headers }
    };
    
    // Удаляем проблемные заголовки
    delete options.headers.host;
    delete options.headers['content-length'];
    
    // Добавляем тело
    if (httpRequest.body && httpRequest.body.length > 0) {
      options.body = httpRequest.body;
    }
    
    console.log(`🌐 Forwarding to local app: ${url.toString()}`);
    
    const response = await fetch(url.toString(), options);
    const body = await response.buffer();
    const headers = {};
    
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    return new HttpResponse({
      request_id: httpRequest.request_id,
      status: response.status,
      headers,
      body
    });
  }
  
  async sendHttpResponse(httpResponse) {
    const frame = new TunnelFrame({
      frame_id: `resp_${Date.now()}`,
      type: FrameType.HTTP_RESPONSE,
      payload: Buffer.from(JSON.stringify(httpResponse)),
      timestamp: Date.now(),
      metadata: {
        request_id: httpResponse.request_id
      }
    });
    
    // В реальности нужно отправлять через стрим
    // Здесь упрощенно через REST API
    await fetch(`${this.config.serverUrl}/grpc/tunnel.TunnelService/HttpProxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: httpResponse.request_id,
        status: httpResponse.status,
        headers: httpResponse.headers,
        body: httpResponse.body.toString('base64')
      })
    });
    
    console.log(`📥 HTTP Response sent: ${httpResponse.status}`);
  }
  
  sendPong(frameId) {
    const frame = new TunnelFrame({
      frame_id: `pong_${Date.now()}`,
      type: FrameType.PONG,
      payload: Buffer.from(JSON.stringify({ original_frame: frameId })),
      timestamp: Date.now()
    });
    
    // Отправка pong (через REST, так как SSE однонаправленное)
    fetch(`${this.config.serverUrl}/grpc/tunnel.TunnelService/HttpProxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pong',
        original_frame: frameId
      })
    }).catch(console.error);
  }
  
  generateClientId() {
    if (!this.clientId) {
      const os = require('os');
      this.clientId = `laptop_${os.hostname()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }
    return this.clientId;
  }
  
  handleDisconnection() {
    this.isConnected = false;
    console.log('🔌 Disconnected from server');
    
    if (this.config.reconnect) {
      this.scheduleReconnect();
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = this.config.reconnectInterval;
    console.log(`🔁 Reconnecting in ${delay}ms...`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }
  
  disconnect() {
    this.isConnected = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }
    
    console.log('👋 Tunnel client disconnected');
  }
}

export default LaptopGrpcClient;
