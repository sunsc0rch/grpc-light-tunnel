// check-generated.js
const tunnelGrpcWeb = require('./tunnel_grpc_web_pb.cjs');

console.log('🔍 Проверяем сгенерированный gRPC-Web код...\n');

// Проверяем класс TunnelServiceClient
const clientProto = tunnelGrpcWeb.TunnelServiceClient.prototype;
console.log('Методы TunnelServiceClient:');
console.log(Object.getOwnPropertyNames(clientProto));

// Проверяем статические свойства
console.log('\nСтатические свойства:');
console.log(Object.getOwnPropertyNames(tunnelGrpcWeb.TunnelServiceClient));

// Проверяем метод tunnelStream
console.log('\nЕсть ли tunnelStream?', 'tunnelStream' in clientProto);
console.log('Есть ли TunnelStream?', 'TunnelStream' in clientProto);

// Выводим весь объект для отладки
console.log('\n📋 Полная структура:');
console.log(JSON.stringify(Object.getOwnPropertyNames(clientProto), null, 2));
