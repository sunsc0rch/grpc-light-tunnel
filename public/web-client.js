// gRPC-Web клиент для браузера...
import { TunnelService } from './tunnel-browser.js';
import { TunnelFrame, HttpRequest } from './tunnel-browser.js';
const Registration = window.tunnelProto.Registration;
const ClientType = window.tunnelProto.ClientType;

class WebTunnelClient {
  constructor(endpoint = '/grpc') {
    this.endpoint = endpoint;
    this.client = null;
    this.stream = null;
    this.clientId = null;
    this.tunnelId = null;
    this.isConnected = false;
    
    // Обфускация в браузере
    this.obfuscationKey = 'browser-obfuscation-key'; // В реальности из конфига
  }
  
  // Подключение через gRPC-Web
  async connect() {
    try {
      console.log('🔗 Connecting via gRPC-Web...');
      
      // Регистрация
      const registration = new Registration();
      registration.setClientId(this.generateClientId());
      registration.setClientType(1); // BROWSER
      registration.setCapabilitiesList(['HTTP_PROXY', 'GRPC_WEB']);
      
      return new Promise((resolve, reject) => {
        grpc.unary(TunnelService.Register, {
          request: registration,
          host: this.endpoint,
          onEnd: (response) => {
            const { status, message } = response;
            
            if (status === grpc.Code.OK && message) {
              this.clientId = message.getClientId();
              this.tunnelId = message.getTunnelId();
              this.isConnected = true;
              
              console.log('✅ Connected:', {
                clientId: this.clientId,
                tunnelId: this.tunnelId,
                obfuscation: message.getObfuscationMethod()
              });
              
              resolve(true);
            } else {
              reject(new Error(`Registration failed: ${status}`));
            }
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      throw error;
    }
  }
  
  // Отправка HTTP запроса через туннель
  async sendHttpRequest(request) {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    
    const httpRequest = new HttpRequest();
    httpRequest.setRequestId(this.generateRequestId());
    httpRequest.setMethod(request.method || 'GET');
    httpRequest.setPath(request.path || '/');
    
    // Заголовки
    const headersMap = httpRequest.getHeadersMap();
    if (request.headers) {
      Object.entries(request.headers).forEach(([key, value]) => {
        headersMap.set(key, value);
      });
    }
    
    // Тело
    if (request.body) {
      if (typeof request.body === 'string') {
        httpRequest.setBody(new TextEncoder().encode(request.body));
      } else {
        httpRequest.setBody(request.body);
      }
    }
    
    // Query параметры
    const queryMap = httpRequest.getQueryMap();
    if (request.query) {
      Object.entries(request.query).forEach(([key, value]) => {
        queryMap.set(key, value);
      });
    }
    
    return new Promise((resolve, reject) => {
      grpc.unary(TunnelService.HttpProxy, {
        request: httpRequest,
        host: this.endpoint,
        onEnd: (response) => {
          const { status, message } = response;
          
          if (status === grpc.Code.OK && message) {
            const headers = {};
            message.getHeadersMap().forEach((value, key) => {
              headers[key] = value;
            });
            
            resolve({
              request_id: message.getRequestId(),
              status: message.getStatus(),
              headers,
              body: message.getBody_asB64()
            });
          } else {
            reject(new Error(`HTTP Proxy failed: ${status}`));
          }
        }
      });
    });
  }
  
  // Простая XOR обфускация в браузере
  xorObfuscate(data, key = this.obfuscationKey) {
    const dataBytes = new TextEncoder().encode(data);
    const keyBytes = new TextEncoder().encode(key);
    const result = new Uint8Array(dataBytes.length);
    
    for (let i = 0; i < dataBytes.length; i++) {
      result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return btoa(String.fromCharCode(...result));
  }
  
  xorDeobfuscate(obfuscated, key = this.obfuscationKey) {
    const dataBytes = Uint8Array.from(atob(obfuscated), c => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(key);
    const result = new Uint8Array(dataBytes.length);
    
    for (let i = 0; i < dataBytes.length; i++) {
      result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return new TextDecoder().decode(result);
  }
  
  // Утилиты
  generateClientId() {
    if (!this.clientId) {
      this.clientId = 'browser_' + Math.random().toString(36).substr(2, 9) + 
                     '_' + Date.now().toString(36);
    }
    return this.clientId;
  }
  
  generateRequestId() {
    return 'req_' + Math.random().toString(36).substr(2, 9) + 
           '_' + Date.now().toString(36);
  }
  
  disconnect() {
    this.isConnected = false;
    this.clientId = null;
    this.tunnelId = null;
    
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }
    
    console.log('🔌 Web client disconnected');
  }
}

// JSON fallback клиент для браузеров без gRPC-Web
class JsonTunnelClient {
  constructor(endpoint = '/api/tunnel') {
    this.endpoint = endpoint;
    this.clientId = null;
    this.isConnected = false;
  }
  
  async connect() {
    try {
      const response = await fetch(`${this.endpoint}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tunnel.register',
          params: {
            client_type: 'browser',
            user_agent: navigator.userAgent,
            capabilities: ['http_proxy']
          },
          id: 1
        })
      });
      
      const data = await response.json();
      
      if (data.jsonrpc === '2.0' && data.result) {
        this.clientId = data.result.client_id;
        this.isConnected = true;
        return true;
      }
      
      throw new Error('Registration failed');
      
    } catch (error) {
      console.error('❌ JSON client connection failed:', error);
      throw error;
    }
  }
  
  async sendHttpRequest(request) {
    // Маскируем запрос как JSON-RPC
    const maskedRequest = {
      jsonrpc: '2.0',
      method: 'tunnel.http_proxy',
      params: {
        request_id: this.generateRequestId(),
        method: request.method,
        path: request.path,
        headers: request.headers || {},
        query: request.query || {},
        body: request.body ? btoa(request.body) : null
      },
      id: Math.floor(Math.random() * 1000000)
    };
    
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(maskedRequest)
    });
    
    const data = await response.json();
    
    if (data.jsonrpc === '2.0' && data.result) {
      return data.result;
    }
    
    throw new Error('Request failed');
  }
  
  generateRequestId() {
    return 'json_req_' + Date.now();
  }
}

// Экспорт
window.StealthTunnel = {
  WebTunnelClient,
  JsonTunnelClient
};
