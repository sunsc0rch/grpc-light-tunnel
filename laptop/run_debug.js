#!/usr/bin/env node
// laptop/run.js - упрощенная версия для тестирования

if (typeof self === 'undefined') {
  global.self = global;
}

const PollingGrpcClient = require('./client.cjs');

const config = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:3003',
  localAppUrl: process.env.LOCAL_APP_URL || 'http://localhost:8100',
  reconnectInterval: 5000,
  pollInterval: 3000, // Увеличиваем интервал до 3 секунд
  debug: true
};

console.log('🚀 Starting Polling gRPC-Web Tunnel Client');
console.log('===========================================');

const client = new PollingGrpcClient(config);

// Функция для вывода статуса
function printStatus() {
  const status = client.getStatus();
  console.log('\n📊 Status:', {
    connected: status.connected,
    polling: status.polling,
    clientId: status.clientId?.substring(0, 20) + '...',
    lastFrameId: status.lastFrameId?.substring(0, 20) + '...',
    requests: status.stats.requestsForwarded,
    polls: status.stats.polls,
    errors: status.stats.errors
  });
}

// Подключаемся
client.connect().then(success => {
  if (success) {
    console.log('✅ Client connected successfully');
    
    // Периодический статус каждые 10 секунд
    setInterval(printStatus, 10000);
    
    // Автоматический перезапуск polling если застрял
    setInterval(() => {
      if (client.isPollingInProgress) {
        const stuckTime = Date.now() - client.lastPollStartTime;
        if (stuckTime > 20000) { // 20 секунд - слишком долго
          console.log(`⚠️  Client stuck for ${stuckTime}ms, resetting...`);
          client.cancelCurrentPoll();
          client.isPollingInProgress = false;
        }
      }
    }, 5000);
  } else {
    console.error('❌ Client failed to connect');
    process.exit(1);
  }
}).catch(error => {
  console.error('Initial connection failed:', error.message);
  process.exit(1);
});

// Обработка сигналов
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  client.disconnect();
  process.exit(0);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  client.disconnect();
  process.exit(1);
});
