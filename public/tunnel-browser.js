// public/tunnel-browser.js
// Полная реализация protobuf для браузера
window.tunnelProto = (function() {
  'use strict';
  
  // Для LAPTOP клиента:
const laptopRegistration = {
  client_type: ClientType.LAPTOP,
  local_app_url: 'http://localhost:8000', // ← ТОЛЬКО для laptop
  capabilities: ['HTTP_PROXY']
};

// Для BROWSER клиента:
const browserRegistration = {
  client_type: ClientType.BROWSER,
  user_agent: navigator.userAgent, // ← для браузера другая инфа
  origin: window.location.origin
  // NO local_app_url!
};
  // ==================== ENUMS ====================
  const FrameType = {
    REGISTER: 0,
    HTTP_REQUEST: 1,
    HTTP_RESPONSE: 2,
    HEALTH_CHECK: 3,
    PING: 4,
    PONG: 5,
    DATA: 6,
    ERROR: 7
  };
  
  const ClientType = {
    LAPTOP: 0,
    BROWSER: 1
  };
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
  const TextEncoder = window.TextEncoder || function() {
    this.encode = function(str) {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
      }
      return bytes;
    };
  };
  
  const TextDecoder = window.TextDecoder || function() {
    this.decode = function(bytes) {
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      return str;
    };
  };
  
  // ==================== КЛАССЫ ====================
  class TunnelFrame {
    constructor(data = {}) {
      this.frame_id = data.frame_id || this.generateId();
      this.type = data.type !== undefined ? data.type : FrameType.DATA;
      this.payload = data.payload || new Uint8Array();
      this.obfuscation_method = data.obfuscation_method || '';
      this.mask_type = data.mask_type || '';
      this.timestamp = data.timestamp || Date.now();
      this.metadata = data.metadata || {};
    }
    
    generateId() {
      return 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    serializeBinary() {
      const obj = {
        frame_id: this.frame_id,
        type: this.type,
        payload: Array.from(this.payload),
        obfuscation_method: this.obfuscation_method,
        mask_type: this.mask_type,
        timestamp: this.timestamp,
        metadata: this.metadata
      };
      return new TextEncoder().encode(JSON.stringify(obj));
    }
    
    static deserializeBinary(data) {
      try {
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        const obj = JSON.parse(str);
        
        // Конвертируем payload обратно в Uint8Array
        if (obj.payload && Array.isArray(obj.payload)) {
          obj.payload = new Uint8Array(obj.payload);
        }
        
        return new TunnelFrame(obj);
      } catch (error) {
        console.error('Failed to deserialize TunnelFrame:', error);
        return new TunnelFrame();
      }
    }
    
    toObject() {
      return {
        frame_id: this.frame_id,
        type: this.type,
        payload: Array.from(this.payload),
        obfuscation_method: this.obfuscation_method,
        mask_type: this.mask_type,
        timestamp: this.timestamp,
        metadata: this.metadata
      };
    }
    
    getFrameId() { return this.frame_id; }
    setFrameId(value) { this.frame_id = value; return this; }
    
    getType() { return this.type; }
    setType(value) { this.type = value; return this; }
    
    getPayload() { return this.payload; }
    setPayload(value) { this.payload = value; return this; }
    
    getPayload_asB64() {
      if (typeof btoa === 'function') {
        return btoa(String.fromCharCode(...this.payload));
      }
      return Buffer.from(this.payload).toString('base64');
    }
    
    getPayload_asU8() { return this.payload; }
  }
  
  class HttpRequest {
    constructor(data = {}) {
      this.request_id = data.request_id || this.generateId();
      this.method = data.method || 'GET';
      this.path = data.path || '/';
      this.headers = data.headers || {};
      this.body = data.body || new Uint8Array();
      this.query = data.query || {};
    }
    
    generateId() {
      return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    serializeBinary() {
      const obj = {
        request_id: this.request_id,
        method: this.method,
        path: this.path,
        headers: this.headers,
        body: Array.from(this.body),
        query: this.query
      };
      return new TextEncoder().encode(JSON.stringify(obj));
    }
    
    static deserializeBinary(data) {
      try {
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        const obj = JSON.parse(str);
        
        if (obj.body && Array.isArray(obj.body)) {
          obj.body = new Uint8Array(obj.body);
        }
        
        return new HttpRequest(obj);
      } catch (error) {
        console.error('Failed to deserialize HttpRequest:', error);
        return new HttpRequest();
      }
    }
    
    getRequestId() { return this.request_id; }
    setRequestId(value) { this.request_id = value; return this; }
    
    getMethod() { return this.method; }
    setMethod(value) { this.method = value; return this; }
    
    getPath() { return this.path; }
    setPath(value) { this.path = value; return this; }
    
    getHeadersMap() {
      return {
        toObject: () => this.headers,
        forEach: (callback) => {
          Object.entries(this.headers).forEach(([key, value]) => {
            callback(value, key);
          });
        }
      };
    }
    
    getBody() { return this.body; }
    setBody(value) { this.body = value; return this; }
    
    getBody_asB64() {
      if (typeof btoa === 'function') {
        return btoa(String.fromCharCode(...this.body));
      }
      return Buffer.from(this.body).toString('base64');
    }
    
    getBody_asU8() { return this.body; }
    
    getQueryMap() {
      return {
        toObject: () => this.query,
        forEach: (callback) => {
          Object.entries(this.query).forEach(([key, value]) => {
            callback(value, key);
          });
        }
      };
    }
  }
  
  class HttpResponse {
    constructor(data = {}) {
      this.request_id = data.request_id || '';
      this.status = data.status !== undefined ? data.status : 200;
      this.headers = data.headers || {};
      this.body = data.body || new Uint8Array();
    }
    
    serializeBinary() {
      const obj = {
        request_id: this.request_id,
        status: this.status,
        headers: this.headers,
        body: Array.from(this.body)
      };
      return new TextEncoder().encode(JSON.stringify(obj));
    }
    
    static deserializeBinary(data) {
      try {
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        const obj = JSON.parse(str);
        
        if (obj.body && Array.isArray(obj.body)) {
          obj.body = new Uint8Array(obj.body);
        }
        
        return new HttpResponse(obj);
      } catch (error) {
        console.error('Failed to deserialize HttpResponse:', error);
        return new HttpResponse();
      }
    }
    
    getRequestId() { return this.request_id; }
    setRequestId(value) { this.request_id = value; return this; }
    
    getStatus() { return this.status; }
    setStatus(value) { this.status = value; return this; }
    
    getHeadersMap() {
      return {
        toObject: () => this.headers,
        forEach: (callback) => {
          Object.entries(this.headers).forEach(([key, value]) => {
            callback(value, key);
          });
        }
      };
    }
    
    getBody() { return this.body; }
    setBody(value) { this.body = value; return this; }
    
    getBody_asB64() {
      if (typeof btoa === 'function') {
        return btoa(String.fromCharCode(...this.body));
      }
      return Buffer.from(this.body).toString('base64');
    }
    
    getBody_asU8() { return this.body; }
  }
  
  class Registration {
    constructor(data = {}) {
      this.client_id = data.client_id || this.generateId();
      this.client_type = data.client_type !== undefined ? data.client_type : ClientType.BROWSER;
      this.capabilities = data.capabilities || [];
      this.local_app_url = data.local_app_url || '';
          // ТОЛЬКО для LAPTOP
    if (this.client_type === ClientType.LAPTOP) {
      this.local_app_url = data.local_app_url || 'http://localhost:8100';
    }
    
    // Для BROWSER - другая информация
    if (this.client_type === ClientType.BROWSER) {
      this.user_agent = data.user_agent;
      this.origin = data.origin;
    }
    }
    
    generateId() {
      return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    serializeBinary() {
      return new TextEncoder().encode(JSON.stringify({
        client_id: this.client_id,
        client_type: this.client_type,
        capabilities: this.capabilities,
        local_app_url: this.local_app_url
      }));
    }
    
    static deserializeBinary(data) {
      try {
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        const obj = JSON.parse(str);
        return new Registration(obj);
      } catch (error) {
        console.error('Failed to deserialize Registration:', error);
        return new Registration();
      }
    }
    
    getClientId() { return this.client_id; }
    setClientId(value) { this.client_id = value; return this; }
    
    getClientType() { return this.client_type; }
    setClientType(value) { this.client_type = value; return this; }
    
    getCapabilitiesList() { return this.capabilities; }
    setCapabilitiesList(value) { this.capabilities = value; return this; }
    if (this.client_type === ClientType.LAPTOP) {
    getLocalAppUrl() { return this.local_app_url; }
    setLocalAppUrl(value) { this.local_app_url = value; return this; }
}
  }
  
  class RegistrationResponse {
    constructor(data = {}) {
      this.client_id = data.client_id || '';
      this.tunnel_id = data.tunnel_id || '';
      this.server_version = data.server_version || '2.0.0';
      this.obfuscation_method = data.obfuscation_method || 'xor';
      this.server_time = data.server_time || Date.now();
    }
    
    serializeBinary() {
      return new TextEncoder().encode(JSON.stringify({
        client_id: this.client_id,
        tunnel_id: this.tunnel_id,
        server_version: this.server_version,
        obfuscation_method: this.obfuscation_method,
        server_time: this.server_time
      }));
    }
    
    static deserializeBinary(data) {
      try {
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        const obj = JSON.parse(str);
        return new RegistrationResponse(obj);
      } catch (error) {
        console.error('Failed to deserialize RegistrationResponse:', error);
        return new RegistrationResponse();
      }
    }
    
    getClientId() { return this.client_id; }
    setClientId(value) { this.client_id = value; return this; }
    
    getTunnelId() { return this.tunnel_id; }
    setTunnelId(value) { this.tunnel_id = value; return this; }
    
    getServerVersion() { return this.server_version; }
    setServerVersion(value) { this.server_version = value; return this; }
    
    getObfuscationMethod() { return this.obfuscation_method; }
    setObfuscationMethod(value) { this.obfuscation_method = value; return this; }
    
    getServerTime() { return this.server_time; }
    setServerTime(value) { this.server_time = value; return this; }
  }
  
  // ==================== GRPC SERVICE ====================
  const TunnelService = {
    TunnelStream: {
      methodName: 'TunnelStream',
      service: 'TunnelService',
      requestStream: true,
      responseStream: true,
      requestType: TunnelFrame,
      responseType: TunnelFrame
    },
    HttpProxy: {
      methodName: 'HttpProxy',
      service: 'TunnelService',
      requestStream: false,
      responseStream: false,
      requestType: HttpRequest,
      responseType: HttpResponse
    },
    Register: {
      methodName: 'Register',
      service: 'TunnelService',
      requestStream: false,
      responseStream: false,
      requestType: Registration,
      responseType: RegistrationResponse
    }
  };
  
  // ==================== ЭКСПОРТ ====================
  return {
    // Enums
    FrameType,
    ClientType,
    
    // Classes
    TunnelFrame,
    HttpRequest,
    HttpResponse,
    Registration,
    RegistrationResponse,
    
    // Service
    TunnelService,
    
    // Utility functions
    utils: {
      encodeBase64: function(data) {
        if (typeof btoa === 'function') {
          return btoa(String.fromCharCode(...new Uint8Array(data)));
        }
        return Buffer.from(data).toString('base64');
      },
      
      decodeBase64: function(str) {
        if (typeof atob === 'function') {
          return Uint8Array.from(atob(str), c => c.charCodeAt(0));
        }
        return Buffer.from(str, 'base64');
      },
      
      obfuscateXOR: function(data, key = 'default-key-32-bytes-long-for-xor-256!') {
        const dataBytes = typeof data === 'string' ? 
          new TextEncoder().encode(data) : 
          new Uint8Array(data);
        
        const keyBytes = new TextEncoder().encode(key);
        const result = new Uint8Array(dataBytes.length);
        
        for (let i = 0; i < dataBytes.length; i++) {
          result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        
        return result;
      }
    }
  };
})();

// Создаем псевдонимы для совместимости
window.proto = window.proto || {};
window.proto.tunnel = window.tunnelProto;
