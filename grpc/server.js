import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { ObfuscationRotator } from '../obfuscation/rotator.js';
import { DataMasker } from '../utils/masking.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Загрузка protobuf
const PROTO_PATH = path.join(__dirname, '../proto/tunnel.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const tunnelProto = grpc.loadPackageDefinition(packageDefinition).tunnel;

// Состояние сервера
const clients = new Map(); // client_id -> {type, stream, metadata}
const tunnels = new Map(); // tunnel_id -> {client_id, created_at, stats}

class TunnelServer {
  constructor() {
    this.obfuscator = new ObfuscationRotator();
    this.masker = new DataMasker();
    this.server = new grpc.Server();
  }
  
  start(port = 50051) {
    this.server.addService(tunnelProto.TunnelService.service, {
      tunnelStream: this.handleTunnelStream.bind(this),
      httpProxy: this.handleHttpProxy.bind(this),
      register: this.handleRegister.bind(this)
    });
    
    this.server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          console.error('❌ gRPC server failed to start:', error);
          return;
        }
        
        console.log(`✅ gRPC server listening on port ${port}`);
        this.server.start();
      }
    );
  }
  
  // Обработка бидирекционального стрима
  handleTunnelStream(call) {
    const clientId = `grpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔗 New gRPC stream connection: ${clientId}`);
    
    // Сохраняем клиента
    clients.set(clientId, {
      type: 'laptop',
      stream: call,
      connectedAt: new Date(),
      lastActivity: Date.now()
    });
    
    // Обработка входящих сообщений
    call.on('data', async (frame) => {
      try {
        await this.processFrame(frame, clientId, call);
        this.updateActivity(clientId);
      } catch (error) {
        console.error('❌ Frame processing error:', error);
        this.sendError(call, error.message, frame.frame_id);
      }
    });
    
    call.on('end', () => {
      console.log(`🔌 gRPC stream ended: ${clientId}`);
      this.cleanupClient(clientId);
    });
    
    call.on('error', (error) => {
      console.error(`❌ gRPC stream error ${clientId}:`, error);
      this.cleanupClient(clientId);
    });
    
    // Отправляем приветственное сообщение
    this.sendWelcome(call, clientId);
  }
  
  // Обработка HTTP прокси запросов (для браузеров через gRPC-Web)
  async handleHttpProxy(call, callback) {
    try {
      const request = call.request;
      console.log(`📡 HTTP Proxy: ${request.method} ${request.path}`);
      
      // Находим активный туннель
      const tunnel = this.findAvailableTunnel();
      
      if (!tunnel) {
        return callback(null, {
          request_id: request.request_id,
          status: 503,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({
            error: 'No tunnel available',
            message: 'Please start your local tunnel client'
          })).toString('base64')
        });
      }
      
      // Пересылаем запрос через туннель
      const response = await this.forwardThroughTunnel(tunnel.clientId, request);
      
      callback(null, response);
      
    } catch (error) {
      console.error('❌ HTTP Proxy error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message
      });
    }
  }
  
  // Регистрация клиента
  handleRegister(call, callback) {
    try {
      const registration = call.request;
      const clientId = registration.client_id || `client_${Date.now()}`;
      
      console.log(`📝 Registration: ${clientId} (${registration.client_type})`);
      
      // Создаем туннель для клиента
      const tunnelId = `tunnel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      tunnels.set(tunnelId, {
        clientId,
        type: registration.client_type,
        createdAt: new Date(),
        stats: {
          requests_forwarded: 0,
          bytes_sent: 0,
          bytes_received: 0
        }
      });
      
      callback(null, {
        client_id: clientId,
        tunnel_id: tunnelId,
        server_version: '2.0.0',
        obfuscation_method: this.obfuscator.currentMethod,
        server_time: Date.now()
      });
      
    } catch (error) {
      console.error('❌ Registration error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message
      });
    }
  }
  
  // Обработка кадра туннеля
  async processFrame(frame, clientId, call) {
    // Деобфусцируем данные
    const payload = this.obfuscator.deobfuscate({
      method: frame.obfuscation_method,
      data: frame.payload,
      ...frame.metadata
    });
    
    // Разбираем в зависимости от типа
    switch(frame.type) {
      case 'REGISTER':
        await this.handleClientRegistration(payload, clientId, call);
        break;
        
      case 'HTTP_REQUEST':
        await this.handleHttpRequest(payload, clientId, call);
        break;
        
      case 'HTTP_RESPONSE':
        await this.handleHttpResponse(payload, clientId);
        break;
        
      case 'PING':
        this.sendPong(call, frame.frame_id);
        break;
        
      case 'DATA':
        console.log('📦 Data frame received:', payload.length, 'bytes');
        break;
        
      default:
        console.warn(`⚠️ Unknown frame type: ${frame.type}`);
    }
  }
  
  async handleHttpRequest(requestData, clientId, call) {
    const request = JSON.parse(requestData.toString());
    
    console.log(`📤 Forwarding HTTP: ${request.method} ${request.path}`);
    
    // Находим туннель
    const tunnel = Array.from(tunnels.values()).find(t => t.clientId === clientId);
    
    if (!tunnel) {
      throw new Error(`No tunnel found for client: ${clientId}`);
    }
    
    // Сохраняем запрос для маршрутизации ответа
    tunnel.pendingRequest = request;
    
    // Здесь должна быть логика пересылки на веб-клиент
    // Пока просто логируем
    console.log(`📤 Request from tunnel ${tunnel.id}:`, {
      method: request.method,
      path: request.path,
      hasBody: !!request.body
    });
  }
  
  async handleHttpResponse(responseData, clientId) {
    const response = JSON.parse(responseData.toString());
    
    console.log(`📥 HTTP Response: ${response.status}`);
    
    // Находим туннель и маршрутизируем ответ
    const tunnel = Array.from(tunnels.values()).find(t => t.clientId === clientId);
    
    if (tunnel && tunnel.pendingRequest) {
      // Обновляем статистику
      tunnel.stats.requests_forwarded++;
      tunnel.stats.bytes_received += response.body ? Buffer.from(response.body, 'base64').length : 0;
      
      // Здесь должен быть код отправки ответа веб-клиенту
      console.log(`📥 Response for request ${tunnel.pendingRequest.id}:`, {
        status: response.status,
        headers: Object.keys(response.headers || {}).length
      });
      
      delete tunnel.pendingRequest;
    }
  }
  
  // Утилитные методы
  sendWelcome(call, clientId) {
    const frame = {
      frame_id: `welcome_${Date.now()}`,
      type: 'DATA',
      payload: Buffer.from(JSON.stringify({
        message: 'Welcome to Stealth Tunnel',
        client_id: clientId,
        server_time: Date.now(),
        obfuscation: this.obfuscator.currentMethod
      })),
      obfuscation_method: 'base64',
      mask_type: 'json',
      timestamp: Date.now()
    };
    
    call.write(frame);
  }
  
  sendPong(call, frameId) {
    const frame = {
      frame_id: `pong_${Date.now()}`,
      type: 'PONG',
      payload: Buffer.from(JSON.stringify({ original_frame: frameId })),
      obfuscation_method: 'base64',
      timestamp: Date.now()
    };
    
    call.write(frame);
  }
  
  sendError(call, message, frameId) {
    const frame = {
      frame_id: `error_${Date.now()}`,
      type: 'ERROR',
      payload: Buffer.from(JSON.stringify({
        error: message,
        original_frame: frameId
      })),
      obfuscation_method: 'base64',
      timestamp: Date.now()
    };
    
    call.write(frame);
  }
  
  findAvailableTunnel() {
    for (const [tunnelId, tunnel] of tunnels) {
      const client = clients.get(tunnel.clientId);
      if (client && client.type === 'laptop') {
        return { tunnelId, ...tunnel };
      }
    }
    return null;
  }
  
  async forwardThroughTunnel(clientId, httpRequest) {
    const client = clients.get(clientId);
    
    if (!client || !client.stream) {
      throw new Error('Tunnel client not available');
    }
    
    // Подготавливаем кадр
    const requestData = JSON.stringify({
      id: httpRequest.request_id || `req_${Date.now()}`,
      method: httpRequest.method,
      path: httpRequest.path,
      headers: httpRequest.headers,
      query: httpRequest.query,
      body: httpRequest.body ? Buffer.from(httpRequest.body, 'base64').toString() : null
    });
    
    const obfuscated = this.obfuscator.obfuscate(requestData);
    
    const frame = {
      frame_id: `http_${Date.now()}`,
      type: 'HTTP_REQUEST',
      payload: Buffer.from(JSON.stringify(obfuscated)),
      obfuscation_method: obfuscated.method,
      mask_type: 'jsonrpc',
      timestamp: Date.now()
    };
    
    // Отправляем через gRPC стрим
    client.stream.write(frame);
    
    // Ждем ответа (в реальности нужен механизм ожидания)
    return new Promise((resolve) => {
      setTimeout(() => {
        // Заглушка - в реальности нужно ждать ответ через туннель
        resolve({
          request_id: httpRequest.request_id,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({
            message: 'Response would come through tunnel'
          })).toString('base64')
        });
      }, 100);
    });
  }
  
  updateActivity(clientId) {
    const client = clients.get(clientId);
    if (client) {
      client.lastActivity = Date.now();
    }
  }
  
  cleanupClient(clientId) {
    const client = clients.get(clientId);
    if (client) {
      console.log(`🧹 Cleaning up client: ${clientId}`);
    }
    
    clients.delete(clientId);
    
    // Удаляем связанные туннели
    for (const [tunnelId, tunnel] of tunnels) {
      if (tunnel.clientId === clientId) {
        tunnels.delete(tunnelId);
        console.log(`🧹 Removed tunnel: ${tunnelId}`);
      }
    }
  }
}

export { TunnelServer };
