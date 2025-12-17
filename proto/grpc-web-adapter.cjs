// proto/grpc-web-adapter.cjs
const improbable = require('@improbable-eng/grpc-web');

// Создаем совместимый MethodDescriptor
class MethodDescriptor {
  constructor(methodPath, methodType, requestType, responseType, requestSerializeFn, responseDeserializeFn) {
    this.methodPath = methodPath;
    this.methodType = methodType;
    this.requestType = requestType;
    this.responseType = responseType;
    this.requestSerializeFn = requestSerializeFn;
    this.responseDeserializeFn = responseDeserializeFn;
  }
}

// Создаем совместимый GrpcWebClientBase
class GrpcWebClientBase {
  constructor(options = {}) {
    this.options = options;
    this.transport = options.transport;
  }
  
  rpcCall(hostname, request, metadata, methodDescriptor, callback) {
    if (!methodDescriptor || !methodDescriptor.methodPath) {
      callback(new Error('Invalid method descriptor'));
      return;
    }
    
    const methodInfo = {
      method: methodDescriptor.methodPath,
      service: {
        serviceName: methodDescriptor.methodPath.split('/')[1] || 'tunnel.TunnelService'
      },
      requestStream: false,
      responseStream: false,
      requestType: methodDescriptor.requestType,
      responseType: methodDescriptor.responseType
    };
    
    // Конвертируем metadata в формат improbable-eng
    const improbableMetadata = new improbable.grpc.Metadata();
    if (metadata && metadata.headersMap) {
      Object.entries(metadata.headersMap).forEach(([key, values]) => {
        values.forEach(value => {
          improbableMetadata.append(key, value);
        });
      });
    }
    
    improbable.grpc.invoke(methodInfo, {
      request: request,
      host: hostname,
      metadata: improbableMetadata,
      transport: this.transport,
      onHeaders: (headers) => {
        console.log('📥 Received headers:', headers);
      },
      onMessage: (message) => {
        console.log('📥 Received message');
      },
      onEnd: (code, message, trailers) => {
        console.log('📥 Request ended:', { code, message: message ? 'has message' : 'no message', trailers });
        
        if (code === improbable.grpc.Code.OK) {
          callback(null, message);
        } else {
          const error = new Error(message || `gRPC error ${code}`);
          error.code = code;
          error.metadata = trailers;
          callback(error);
        }
      }
    });
  }
  
  unaryCall(hostname, request, metadata, methodDescriptor) {
    return new Promise((resolve, reject) => {
      this.rpcCall(hostname, request, metadata, methodDescriptor, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Экспортируем совместимый объект grpc.web
module.exports = {
  web: {
    // MethodType константы
    MethodType: { 
      UNARY: 0, 
      SERVER_STREAMING: 1, 
      CLIENT_STREAMING: 2, 
      BIDI_STREAMING: 3 
    },
    
    // Классы
    MethodDescriptor: MethodDescriptor,
    AbstractClientBase: class {},
    GrpcWebClientBase: GrpcWebClientBase,
    ClientReadableStream: class {},
    ClientWritableStream: class {},
    ClientDuplexStream: class {},
    
    // Метаданные
    Metadata: class Metadata {
      constructor(init) {
        this.headersMap = init || {};
      }
      
      append(key, value) {
        if (!this.headersMap[key]) {
          this.headersMap[key] = [];
        }
        this.headersMap[key].push(value);
      }
      
      get(key) {
        return this.headersMap[key];
      }
    }
  }
};
