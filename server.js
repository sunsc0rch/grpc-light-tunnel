import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Импорт СГЕНЕРИРОВАННЫХ protobuf файлов
import { TunnelFrame, HttpRequest, HttpResponse, Registration, RegistrationResponse, FrameType, ClientType } from './proto/proto/tunnel_pb.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Хранилища
const clients = new Map(); // client_id -> {type, metadata}
const tunnels = new Map(); // tunnel_id -> {client_id, stats}
const streams = new Map(); // client_id -> EventEmitter stream

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ==================== gRPC-Web эндпоинты ====================

// gRPC-Web стрим (имитация через Server-Sent Events)
app.get('/grpc/tunnel/stream', (req, res) => {
  const clientId = req.query.client_id || `client_${Date.now()}`;
  
  console.log(`🔗 gRPC-Web stream started: ${clientId}`);
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Создаем стрим для клиента
  const stream = {
    id: clientId,
    write: (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close: () => {
      res.end();
    }
  };
  
  streams.set(clientId, stream);
  
  // Отправляем приветственное сообщение
  const welcomeFrame = new TunnelFrame({
    frame_id: `welcome_${Date.now()}`,
    type: FrameType.DATA,
    payload: Buffer.from(JSON.stringify({
      message: 'Connected to gRPC-Web tunnel',
      client_id: clientId,
      server_time: Date.now()
    })),
    timestamp: Date.now()
  });
  
  stream.write(welcomeFrame);
  
  // Обработка закрытия соединения
  req.on('close', () => {
    console.log(`🔌 Stream closed: ${clientId}`);
    streams.delete(clientId);
    clients.delete(clientId);
  });
});

app.post('/api/register', (req, res) => {
  const key = crypto.randomBytes(32).toString('hex');
  const { client_type, local_app_url, user_agent } = req.body;
  
  if (client_type === 'laptop') {
    // Сохраняем local_app_url для маршрутизации
    saveLaptopClient(local_app_url);
    res.json({ type: 'laptop', tunnel_id: '...' });
    
  } else if (client_type === 'browser') {
    // Браузеру не нужен tunnel
    res.json({ type: 'browser', client_id: '...' });
  }
  res.json({ 
    clientId: '...',
    obfuscationKey: key,
    expiresAt: Date.now() + 3600000 // 1 час
  });
});

// gRPC-Web унарные вызовы (POST)
app.post('/grpc/tunnel.TunnelService/:method', async (req, res) => {
  const method = req.params.method;
  const contentType = req.headers['content-type'] || '';
  
  console.log(`📡 gRPC-Web call: ${method}`);
  
  try {
    let result;
    
    switch(method) {
      case 'Register':
        result = await handleRegister(req.body);
        break;
        
      case 'HttpProxy':
        result = await handleHttpProxy(req.body);
        break;
        
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    // Форматируем ответ как gRPC-Web
    if (contentType.includes('application/grpc-web-text')) {
      // Для реального gRPC-Web (base64 encoded)
      res.setHeader('Content-Type', 'application/grpc-web-text+proto');
      res.setHeader('grpc-status', '0');
      res.send(result.serializeBinary());
    } else {
      // JSON fallback
      res.json({
        success: true,
        data: result,
        method: method
      });
    }
    
  } catch (error) {
    console.error(`❌ gRPC-Web error (${method}):`, error);
    
    if (contentType.includes('application/grpc-web-text')) {
      res.setHeader('grpc-status', '13'); // INTERNAL
      res.setHeader('grpc-message', encodeURIComponent(error.message));
      res.end();
    } else {
      res.status(500).json({
        error: error.message,
        method: method
      });
    }
  }
});

// ==================== Обработчики gRPC ====================

async function handleRegister(data) {
  let registration;
  
  // Парсим в зависимости от формата
  if (data.type === 'jsonrpc') {
    // JSON-RPC формат
    registration = {
      client_id: data.params.client_id,
      client_type: data.params.client_type === 'browser' ? ClientType.BROWSER : ClientType.LAPTOP,
      capabilities: data.params.capabilities || [],
      local_app_url: data.params.local_app_url || ''
    };
  } else {
    // Прямой protobuf-like формат
    registration = data;
  }
  
  const clientId = registration.client_id || `client_${Date.now()}`;
  const tunnelId = `tunnel_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  // Сохраняем клиента
  clients.set(clientId, {
    id: clientId,
    type: registration.client_type === ClientType.BROWSER ? 'browser' : 'laptop',
    connectedAt: new Date(),
    capabilities: registration.capabilities,
    tunnelId
  });
  
  // Создаем туннель для laptop клиентов
  if (registration.client_type === ClientType.LAPTOP) {
    tunnels.set(tunnelId, {
      id: tunnelId,
      clientId,
      createdAt: new Date(),
      stats: { requests: 0, bytes: 0 }
    });
    
    console.log(`💻 Laptop registered: ${clientId} (tunnel: ${tunnelId})`);
  } else {
    console.log(`🌐 Browser registered: ${clientId}`);
  }
  
  // Возвращаем ответ
  return new RegistrationResponse({
    client_id: clientId,
    tunnel_id: tunnelId,
    server_version: '2.0.0',
    obfuscation_method: 'xor', // или из конфига
    server_time: Date.now()
  });
}

async function handleHttpProxy(data) {
  const request = data;
  
  console.log(`🌐 HTTP Proxy: ${request.method} ${request.path}`);
  
  // Находим активный laptop туннель
  const tunnel = Array.from(tunnels.values()).find(t => {
    const client = clients.get(t.clientId);
    return client && client.type === 'laptop';
  });
  
  if (!tunnel) {
    throw new Error('No active laptop tunnel found');
  }
  
  const laptopClient = clients.get(tunnel.clientId);
  const stream = streams.get(laptopClient.id);
  
  if (!stream) {
    throw new Error('Laptop client not connected via stream');
  }
  
  // Создаем HTTP запрос для пересылки
  const httpRequest = new HttpRequest({
    request_id: request.request_id || `req_${Date.now()}`,
    method: request.method,
    path: request.path,
    headers: request.headers || {},
    body: request.body ? Buffer.from(request.body) : Buffer.from(''),
    query: request.query || {}
  });
  
  // Создаем туннельный кадр
  const frame = new TunnelFrame({
    frame_id: `http_${Date.now()}`,
    type: FrameType.HTTP_REQUEST,
    payload: httpRequest.serializeBinary(),
    timestamp: Date.now(),
    metadata: {
      content_type: 'application/json',
      source: 'browser'
    }
  });
  
  // Отправляем через стрим
  stream.write(frame);
  
  // В реальности нужно ждать ответа через стрим
  // Здесь упрощенно возвращаем заглушку
  return new HttpResponse({
    request_id: httpRequest.request_id,
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      message: 'Request forwarded through tunnel',
      tunnel_id: tunnel.id,
      timestamp: Date.now()
    }))
  });
}

// ==================== HTTP маршруты (для совместимости) ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    tunnels: tunnels.size,
    streams: streams.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    grpc_web: true,
    timestamp: new Date().toISOString()
  });
});

// HTTP прокси для обратной совместимости
app.all('/proxy/*', async (req, res) => {
  const targetPath = req.params[0] || '';
  
  // Конвертируем в gRPC-Web запрос
  const httpRequest = {
    request_id: `http_${Date.now()}`,
    method: req.method,
    path: '/' + targetPath,
    headers: { ...req.headers },
    query: req.query,
    body: req.body ? JSON.stringify(req.body) : null
  };
  
  try {
    const response = await handleHttpProxy(httpRequest);
    
    // Устанавливаем заголовки
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    
    res.status(response.status || 200);
    
    if (response.body && response.body.length > 0) {
      res.send(response.body);
    } else {
      res.end();
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(502).json({
      error: 'Tunnel proxy failed',
      message: error.message
    });
  }
});

// ==================== Запуск сервера ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
🚀 Stealth gRPC Tunnel Server
📡 Port: ${PORT}
🌐 Endpoints:
   http://localhost:${PORT}/                    - Main page
   http://localhost:${PORT}/status              - Status
   http://localhost:${PORT}/health              - Health check
   http://localhost:${PORT}/grpc/tunnel/stream  - gRPC-Web stream (SSE)
   http://localhost:${PORT}/grpc/*              - gRPC-Web calls
   http://localhost:${PORT}/proxy/*             - HTTP proxy (legacy)
   
🔒 Features:
   ✅ gRPC-Web over HTTP/1.1
   ✅ Server-Sent Events for streaming
   ✅ No protoc required at runtime
   ✅ Render.com compatible
  `);
});
