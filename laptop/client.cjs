const { EventEmitter } = require('events');
const crypto = require('crypto');
const { grpc } = require('@improbable-eng/grpc-web');
const { NodeHttpTransport } = require('@improbable-eng/grpc-web-node-http-transport');

// Загружаем protobuf модули
const proto = require('../proto/proto/tunnel_pb.cjs');
const grpcWeb = require('../proto/tunnel_grpc_web_pb.cjs');

const TunnelFrame = proto.TunnelFrame;
const HttpRequest = proto.HttpRequest;
const HttpResponse = proto.HttpResponse;
const RegistrationRequest = proto.Registration || proto.RegistrationRequest;
// Константы для типов фреймов
const FrameType = {
  UNKNOWN: 0,
  HTTP_REQUEST: 1,
  HTTP_RESPONSE: 2,
  PING: 3,
  PONG: 4,
  DATA: 5
};

class LaptopGrpcClient {
  constructor(config) {
    this.config = {
      serverUrl: config.serverUrl || 'https://racermagenta-g8jcvu--79167.stormkit.dev',
      localAppUrl: config.localAppUrl || 'http://localhost:8100',
      reconnectInterval: config.reconnectInterval || 5000,
      reconnect: true,
      ...config
    };
  this.debug = config.debug !== false;
  if (this.debug) {
    console.log('🐛 Debug mode enabled');
  }    
    this.clientId = null;
    this.tunnelId = null;
    this.stream = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.eventEmitter = new EventEmitter();
    this.pendingRequests = new Map();
    
    // Устанавливаем транспорт для Node.js
    grpc.setDefaultTransport(NodeHttpTransport());
    
    console.log('🖥️  Laptop gRPC Tunnel Client initialized');
    console.log(`🔗 Server URL: ${this.config.serverUrl}`);
    console.log(`🏠 Local App: ${this.config.localAppUrl}`);
  }
  
  async connect() {
    try {
      console.log('\n🔗 Connecting to gRPC server...');
      
      // Создаем gRPC клиент
      this.grpcClient = new grpcWeb.TunnelServiceClient(this.config.serverUrl);
      
      // Создаем запрос регистрации
      const registration = new RegistrationRequest();
      registration.setClientId(this.generateClientId());
      registration.setClientType(0); // LAPTOP
      registration.setLocalAppUrl(this.config.localAppUrl);
      
      // Добавляем capabilities
      registration.addCapabilities('HTTP_PROXY');
      registration.addCapabilities('GRPC_STREAM');
      
      console.log('📝 Registering client...');
      
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        this.grpcClient.register(registration, {}, (err, response) => {
          const elapsed = Date.now() - startTime;
 if (this.debug) {
      console.log(`⏱️  Registration call took ${elapsed}ms`);
      console.log('📤 Sent registration:', {
        clientId: registration.getClientId(),
        clientType: registration.getClientType(),
        localAppUrl: registration.getLocalAppUrl(),
        capabilities: registration.getCapabilitiesList()
      });
    }       
    if (err) {
      console.error('❌ Registration failed with error:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      reject(err);
      return;
    }
          console.log('✅ Registration successful');
    if (this.debug) {
      console.log('📥 Received registration response:', {
        success: response ? response.getSuccess() : 'null response',
        message: response ? response.getMessage() : 'no message',
        tunnelId: response ? response.getTunnelId() : 'no tunnelId'
      });
    }
          
          if (response && response.getSuccess()) {
            const data = response.getData();
            if (data) {
              this.clientId = data.getClientId();
              this.tunnelId = data.getTunnelId();
              
              console.log(`🆔 Client ID: ${this.clientId}`);
              console.log(`🔄 Tunnel ID: ${this.tunnelId}`);
              
              // Подключаемся к стриму
              this.connectToStream();
              resolve(true);
            } else {
              reject(new Error('No data in registration response'));
            }
          } else {
            reject(new Error('Registration response indicates failure'));
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Connection error:', error.message);
      this.scheduleReconnect();
      throw error;
    }
  }
  
  connectToStream() {
    console.log('\n📡 Connecting to tunnel stream...');
    
    try {
      // Создаем метаданные с client-id
      const metadata = new grpc.Metadata();
      metadata.set('client-id', this.clientId);
      
      // Создаем пустой запрос (если требуется)
      const request = {};
      
      // Открываем стрим
      this.stream = this.grpcClient.tunnelStream(request, metadata);
      
      // Обработчики стрима
      this.stream.on('data', (response) => {
        console.log('📨 Received frame from server');
        this.handleIncomingFrame(response);
      });
      
      this.stream.on('end', () => {
        console.log('🔌 Stream ended by server');
        this.handleDisconnection();
      });
      
      this.stream.on('error', (error) => {
        console.error('❌ Stream error:', error.message);
        this.handleDisconnection();
      });
      
      this.stream.on('status', (status) => {
        console.log('📊 Stream status:', status.code, status.details || '');
      });
      
      this.isConnected = true;
      console.log('✅ Tunnel stream connected');
      console.log('🚀 Ready to receive requests from server');
      
    } catch (error) {
      console.error('❌ Stream connection error:', error.message);
      this.handleDisconnection();
    }
  }
  
  handleIncomingFrame(frame) {
    try {
      if (!frame) {
        console.warn('⚠️ Received empty frame');
        return;
      }
      
      const frameType = frame.getType();
      const frameId = frame.getFrameId();
      
      console.log(`📦 Frame ID: ${frameId}, Type: ${frameType}`);
      
      // Обработка по типу фрейма
      switch(frameType) {
        case FrameType.HTTP_REQUEST:
          console.log('🌐 HTTP Request received');
          this.handleHttpRequest(frame);
          break;
          
        case FrameType.PING:
          console.log('🏓 PING received');
          this.sendPong(frameId);
          break;
          
        case FrameType.DATA:
          console.log('📊 Data frame received');
          break;
          
        default:
          console.warn(`⚠️ Unknown frame type: ${frameType}`);
      }
      
    } catch (error) {
      console.error('❌ Error processing frame:', error.message);
    }
  }
  
  async handleHttpRequest(frame) {
    try {
      const requestId = frame.getMetadataMap().get('request_id');
      console.log(`📤 Processing HTTP request: ${requestId}`);
      
      // TODO: Реализовать логику перенаправления на локальное приложение
      // Пока просто отправляем тестовый ответ
      
      const response = new HttpResponse();
      response.setRequestId(requestId);
      response.setStatus(200);
      response.setBody(new TextEncoder().encode(JSON.stringify({
        message: 'Hello from gRPC tunnel',
        timestamp: new Date().toISOString(),
        requestId: requestId
      })));
      
      // Устанавливаем заголовки
      response.getHeadersMap().set('content-type', 'application/json');
      
      await this.sendHttpResponse(response);
      
    } catch (error) {
      console.error('❌ HTTP request handling error:', error.message);
    }
  }
  
  async sendHttpResponse(httpResponse) {
    try {
      const frame = new TunnelFrame();
      frame.setFrameId(`resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      frame.setType(FrameType.HTTP_RESPONSE);
      frame.setTimestamp(Date.now());
      
      // Устанавливаем payload
      frame.setPayload(httpResponse.serializeBinary());
      
      // Устанавливаем метаданные
      frame.getMetadataMap().set('request_id', httpResponse.getRequestId());
      
      // Отправляем через стрим
      if (this.stream && this.isConnected) {
        this.stream.write(frame);
        console.log(`📥 HTTP Response sent for request: ${httpResponse.getRequestId()}`);
      } else {
        console.error('❌ Cannot send response: stream not connected');
      }
      
    } catch (error) {
      console.error('❌ Error sending HTTP response:', error.message);
    }
  }
  
  sendPong(frameId) {
    try {
      const frame = new TunnelFrame();
      frame.setFrameId(`pong_${Date.now()}`);
      frame.setType(FrameType.PONG);
      frame.setTimestamp(Date.now());
      
      // Устанавливаем метаданные
      frame.getMetadataMap().set('original_frame', frameId);
      
      if (this.stream && this.isConnected) {
        this.stream.write(frame);
        console.log(`🏓 PONG sent for frame: ${frameId}`);
      }
      
    } catch (error) {
      console.error('❌ Error sending PONG:', error.message);
    }
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
    console.log('\n🔌 Disconnected from server');
    
    if (this.config.reconnect !== false) {
      this.scheduleReconnect();
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = this.config.reconnectInterval;
    console.log(`🔁 Attempting reconnect in ${delay}ms...`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log('🔄 Reconnecting...');
      this.connect().catch(error => {
        console.error('❌ Reconnection failed:', error.message);
        this.scheduleReconnect();
      });
    }, delay);
  }
  
  disconnect() {
    console.log('\n👋 Shutting down tunnel client...');
    
    this.isConnected = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.stream) {
      this.stream.cancel();
      this.stream = null;
    }
    
    console.log('✅ Tunnel client stopped');
  }
}

module.exports = LaptopGrpcClient;

