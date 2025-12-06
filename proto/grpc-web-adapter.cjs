// proto/grpc-web-adapter.cjs
const improbable = require('@improbable-eng/grpc-web');
const { NodeHttpTransport } = require('@improbable-eng/grpc-web-node-http-transport');

// Создаем совместимый MethodDescriptor
class MethodDescriptor {
  constructor(methodPath, methodType, requestType, responseType, requestSerializeFn, responseDeserializeFn) {
    this.methodPath = methodPath;
    this.methodType = methodType;
    this.requestType = requestType;
    this.responseType = responseType;
    this.requestSerializeFn = requestSerializeFn;
    this.responseDeserializeFn = responseDeserializeFn;
    this.serviceName = methodPath.split('/')[1] || 'tunnel.TunnelService';
    this.methodName = methodPath.split('/')[2] || '';
    this.requestStream = false;
    this.responseStream = false;
  }
}

// Создаем совместимый GrpcWebClientBase
class GrpcWebClientBase {
  constructor(options = {}) {
    this.options = options;
    this.transport = options.transport || NodeHttpTransport();
  }
  
  rpcCall(hostname, request, metadata, methodDescriptor, callback) {
    if (!methodDescriptor || !methodDescriptor.methodPath) {
      callback(new Error('Invalid method descriptor'));
      return;
    }
    
    const methodInfo = {
      method: methodDescriptor.methodPath,
      service: {
        serviceName: methodDescriptor.serviceName
      },
      requestStream: false,
      responseStream: false,
      requestType: methodDescriptor.requestType,
      responseType: methodDescriptor.responseType
    };
    
    improbable.grpc.invoke(methodInfo, {
      request: request,
      host: hostname,
      metadata: metadata || {},
      transport: this.transport,
      onEnd: (response) => {
        if (response.status === 0) {
          callback(null, response.message);
        } else {
          const error = new Error(response.statusMessage || `gRPC error ${response.status}`);
          error.code = response.status;
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
    Metadata: improbable.grpc.Metadata || class {}
  }
};
