#!/usr/bin/env node

// Патч для Node.js
if (typeof self === 'undefined') {
  global.self = global;
}

const FastGrpcTunnelClient = require('./client.cjs');

const config = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:3003',
  localAppUrl: process.env.LOCAL_APP_URL || 'http://localhost:8100',
  pollInterval: 1000,
  debug: process.env.DEBUG === 'true'
};

console.log('🚀 Starting Fast gRPC-Web Tunnel Client\n');

const client = new FastGrpcTunnelClient(config);

// Подключаемся
client.connect().catch(error => {
  console.error('❌ Initial connection failed:', error.message);
  console.log('Retrying in 5 seconds...');
  setTimeout(() => process.exit(1), 5000);
});

// Обработка сигналов
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  client.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  client.disconnect();
  process.exit(0);
});

// Периодический статус
setInterval(() => {
  const status = client.getStatus();
  console.log(`
📊 Status:
   Connected: ${status.connected ? '✅' : '❌'}
   Polling: ${status.polling ? '🔄' : '⏸️'}
   Requests: ${status.stats.requestsForwarded}
   Polls: ${status.stats.polls}
   Frames: ${status.stats.framesReceived}
   Errors: ${status.stats.errors}
  `);
}, 30000);
