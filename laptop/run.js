#!/usr/bin/env node

const LaptopGrpcClient = require('./client.cjs');

// Конфигурация
const config = {
  // URL вашего сервера на Stormkit
  serverUrl: process.env.SERVER_URL || 'https://racermagenta-g8jcvu--79167.stormkit.dev',
  
  // URL вашего локального приложения (Wagtail)
  localAppUrl: process.env.LOCAL_APP_URL || 'http://localhost:8100',
  
  // Интервал переподключения (мс)
  reconnectInterval: 5000,
  
  // Автоматическое переподключение
  reconnect: true
};

console.log('🚀 Starting gRPC Tunnel Client');
console.log('==============================');

// Создаем клиент
const client = new LaptopGrpcClient(config);

// Подключаемся
client.connect().catch(error => {
  console.error('Failed to connect:', error.message);
  process.exit(1);
});

// Обработка сигналов завершения
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  client.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  client.disconnect();
  process.exit(0);
});

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  client.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  client.disconnect();
  process.exit(1);
});
