// server.js - упрощенная рабочая версия с обработкой кук
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { CookieJar } from 'tough-cookie';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const cookieJar = new CookieJar();
// Хранилища
const clients = new Map();
const tunnels = new Map();
const messageQueues = new Map();
const pendingRequests = new Map();
const activePolls = new Map();
const processedFrames = new Map();
const processedResponses = new Set();

// Загрузка protobuf
async function loadProtobuf() {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    return require('./proto/tunnel_pb.cjs');
  } catch (error) {
    console.error('❌ Ошибка загрузки protobuf:', error);
    throw error;
  }
}

let tunnelProto;

// ==================== УТИЛИТЫ ====================

function addToQueue(clientId, frame) {
  if (!messageQueues.has(clientId)) {
    messageQueues.set(clientId, []);
  }

  const queue = messageQueues.get(clientId);
  const frameId = `frame_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  queue.push({
    frame: frame,
    timestamp: Date.now(),
    id: frameId
  });

  // Пробуждаем long polling если есть
  const poll = activePolls.get(clientId);
  if (poll && poll.res && !poll.res.headersSent) {
    console.log(`🔔 Waking up long polling for ${clientId}`);

    if (poll.timeoutId) {
      clearTimeout(poll.timeoutId);
    }

    const messages = getMessagesFromQueue(clientId, poll.lastFrameId);
    const frames = messages.map(item => item.frame);

    setTimeout(() => {
      safeSendPollResponse(clientId, poll.res, frames, false, poll.lastFrameId);
    }, 100);
  }

  console.log(`📥 Message added to queue for ${clientId}, queue size: ${queue.length}`);
}

function getMessagesFromQueue(clientId, lastFrameId) {
  if (!messageQueues.has(clientId)) {
    return [];
  }

  const queue = messageQueues.get(clientId);

  if (queue.length === 0) {
    return [];
  }

  // Если нет lastFrameId или пустая строка - отправляем весь буфер
  if (!lastFrameId || lastFrameId === '') {
    console.log(`📤 First poll for ${clientId}, sending ALL ${queue.length} frames`);
    return [...queue];
  }

  // Ищем индекс фрейма
  const lastIndex = queue.findIndex(msg => msg.id === lastFrameId);

  if (lastIndex === -1) {
    // Фрейм не найден - клиент отстал, отправляем последние сообщения
    console.log(`⚠️  ${clientId} out of sync, sending recent frames`);
    const recentFrames = queue.slice(-3); // Последние 3 фрейма
    return recentFrames;
  }

  // Отправляем фреймы после найденного
  const newMessages = queue.slice(lastIndex + 1);
  console.log(`📤 Sending ${newMessages.length} new frames to ${clientId}`);

  return newMessages;
}

function acknowledgeFrames(clientId, lastFrameId) {
  if (!messageQueues.has(clientId) || !lastFrameId) {
    return;
  }

  const queue = messageQueues.get(clientId);
  const lastIndex = queue.findIndex(msg => msg.id === lastFrameId);

  if (lastIndex >= 0) {
    const removed = queue.splice(0, lastIndex + 1);
    console.log(`✅ Acknowledged ${removed.length} frames for ${clientId}, queue: ${queue.length}`);
  }
}

function debugHtmlStructure(html, requestId) {
  console.log(`🔍 HTML DEBUG for ${requestId}:`);
  console.log(`   Length: ${html.length} chars`);
  console.log(`   Has <!DOCTYPE: ${html.includes('<!DOCTYPE')}`);
  console.log(`   Has <html: ${html.includes('<html')}`);
  console.log(`   Has <head: ${html.includes('<head')}`);
  console.log(`   Has </head>: ${html.includes('</head>')}`);
  console.log(`   Has <body: ${html.includes('<body')}`);
  console.log(`   Has </body>: ${html.includes('</body>')}`);
  console.log(`   Has </html>: ${html.includes('</html>')}`);
  console.log(`   Last 200 chars: ${html.slice(-200)}`);
}
// ==================== gRPC-Web утилиты ====================

function parseGrpcWebMessage(data) {
  if (!data || data.length < 5) {
    return data;
  }

  const flags = data[0];
  const length = data.readUInt32BE(1);

  if (data.length >= 5 + length) {
    return data.slice(5, 5 + length);
  }

  return data.slice(5);
}

function createGrpcWebResponse(protoData) {
  const prefix = Buffer.alloc(5);
  prefix[0] = 0;
  prefix.writeUInt32BE(protoData.length, 1);
  return Buffer.concat([prefix, protoData]);
}

function createGrpcWebError(statusCode, message) {
  const prefix = Buffer.alloc(5);
  prefix[0] = 0x80;
  prefix.writeUInt32BE(0, 1);

  const trailers = `grpc-status: ${statusCode}\r\ngrpc-message: ${encodeURIComponent(message)}`;

  return Buffer.concat([prefix, Buffer.from(trailers)]);
}

// ==================== Мидлвары ====================
app.use((req, res, next) => {
  // Восстанавливаем client_id из cookie если нет в заголовках
  if (!req.headers['x-tunnel-client-id'] && req.cookies && req.cookies.tunnel_client_id) {
    req.headers['x-tunnel-client-id'] = req.cookies.tunnel_client_id;
    console.log(`🔧 Restored client_id from cookie: ${req.cookies.tunnel_client_id}`);
  }
  next();
});

// Подключаем cookie-parser
import cookieParser from 'cookie-parser';
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') ||
      req.path.startsWith('/static/') ||
      req.path.startsWith('/media/') ||
      req.path.startsWith('/admin/static/') ||
      req.path.startsWith('/files/') ||
      req.path.startsWith('/tunnel/') ||
      req.path.startsWith('/tunnel.TunnelService/') ||
      req.path === '/' ||
      req.path.includes('.')) {
    return next();
  }

    // Все остальные пути редиректим через /tunnel/
    const clientId = req.query.client_id || req.cookies?.tunnel_client_id;
    if (clientId) {
        console.log(`🔄 Redirect ${req.path} → /tunnel${req.path}`);
        return res.redirect(307, `/tunnel${req.path}?client_id=${clientId}`);
    }
  // КРИТИЧЕСКИ ВАЖНЫЕ заголовки для работы кук
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-grpc-web, x-user-agent, x-grpc-client-id, x-grpc-tunnel-id, authorization, cookie, x-tunnel-client-id, x-requested-with, x-csrftoken, csrftoken, sessionid, referer, origin, user-agent');
  res.setHeader('Access-Control-Expose-Headers', 'grpc-status, grpc-message, access-control-expose-headers, set-cookie, location, content-type, content-length');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'true'); // Разрешаем credentials
  res.setHeader('Vary', 'Origin'); // Важно для кэширования
  res.setHeader('X-Frame-Options', 'ALLOW-FROM *');

  // Для preflight запросов
  if (req.method === 'OPTIONS') {
    // Добавляем дополнительные заголовки для preflight
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  next();
});
app.use(['/static', '/media', '/admin/static', '/files'], async (req, res) => {

  const fullPath = req.originalUrl; // ИЛИ: req.baseUrl + req.path

  console.log(`📁 STATIC FILE REQUEST DEBUG:`);
  console.log(`   req.originalUrl: ${req.originalUrl}`);
  console.log(`   req.baseUrl: ${req.baseUrl}`);
  console.log(`   req.path: ${req.path}`);
  console.log(`   req.url: ${req.url}`);

  let originalPath;
  if (req.originalUrl) {
    originalPath = req.originalUrl;
  } else {
    // Восстанавливаем вручную
    originalPath = req.baseUrl + req.path;
    if (!originalPath.startsWith('/')) {
      originalPath = '/' + originalPath;
    }
  }

  console.log(`📁 STATIC FILE: ${originalPath}`);

  // Находим активный laptop
  let activeLaptop = null;
  for (const [clientId, client] of clients.entries()) {
    if (client.type === 'laptop') {
      activeLaptop = client;
      break;
    }
  }

  if (!activeLaptop) {
    console.log('❌ No laptop for static file');
    return serveStaticPlaceholder(originalPath, res);
  }

  const requestId = `static_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Сохраняем запрос с ПОЛНЫМ путем
  pendingRequests.set(requestId, {
    res,
    requestedAt: Date.now(),
    laptopId: activeLaptop.id,
    isStatic: true,
    originalPath: originalPath, // ПОЛНЫЙ путь: /static/css/main.min.css
    contentType: getContentType(originalPath)
  });

  // Создаем запрос с ПОЛНЫМ путем
  const httpRequest = new tunnelProto.HttpRequest();
  httpRequest.setRequestId(requestId);
  httpRequest.setMethod('GET');
  httpRequest.setPath(originalPath);

  // Минимальные заголовки
  const headers = {
    'Accept': '*/*',
    'User-Agent': 'Tunnel-Static/1.0'
  };

  if (req.headers.cookie) {
    headers['Cookie'] = req.headers.cookie;
  }

  httpRequest.setHeaders(JSON.stringify(headers));
  httpRequest.setBody(Buffer.from(''));
  httpRequest.setQuery('{}');

  const frame = new tunnelProto.TunnelFrame();
  frame.setFrameId(`frame_${requestId}`);
  frame.setType(tunnelProto.FrameType.HTTP_REQUEST);
  frame.setTimestamp(Date.now());

  // Metadata - передаем что это статика
  const metadataMap = frame.getMetadataMap();
  metadataMap.set('request_id', requestId);
  metadataMap.set('is_static', 'true');
  metadataMap.set('original_path', originalPath);
  metadataMap.set('full_path', originalPath);

  frame.setPayload(httpRequest.serializeBinary());

  console.log(`📤 Static to laptop: ${originalPath} (${requestId})`);
  addToQueue(activeLaptop.id, frame);

  // Таймаут 3 секунды
  const timeout = setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      console.log(`⏰ Static timeout: ${originalPath}`);
      pendingRequests.delete(requestId);
      if (!res.headersSent) {
        serveStaticPlaceholder(originalPath, res);
      }
    }
  }, 3000);

  res.on('close', () => {
    clearTimeout(timeout);
    pendingRequests.delete(requestId);
  });
});

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function getContentType(path) {
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.ico')) return 'image/x-icon';
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.ttf')) return 'font/ttf';
  if (path.endsWith('.eot')) return 'application/vnd.ms-fontobject';
  return 'application/octet-stream';
}

function serveStaticPlaceholder(path, res) {
  const contentType = getContentType(path);
  res.setHeader('Content-Type', contentType);

  if (path.endsWith('.css')) {
    res.send('/* Placeholder CSS */\nbody { visibility: visible !important; }');
  } else if (path.endsWith('.js')) {
    res.send('// Placeholder JS\nconsole.log("Static placeholder");');
  } else if (path.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
    // 1x1 прозрачный пиксель
    res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  } else {
    res.status(404).send('Static file not available');
  }
}
app.use(express.static('public'));

app.use((req, res, next) => {
  // Перехватываем HTML ответы чтобы добавить наш скрипт
  const originalSend = res.send;
  res.send = function(body) {
    if (typeof body === 'string' &&
        res.get('Content-Type') &&
        res.get('Content-Type').includes('text/html') &&
        !req.path.startsWith('/static/') &&
        !req.path.startsWith('/media/') &&
        !req.path.startsWith('/api/') &&
        !req.path.startsWith('/tunnel.TunnelService/')) {

      console.log(`🔧 MAIN MIDDLEWARE: Injecting script for ${req.path}`);

      try {
        // Удаляем debug toolbar
        body = body.replace(/<div[^>]*id="djDebug"[^>]*>[\s\S]*?<\/div>/gi, '');

        const injectScript = `
          <script>
            // Main tunnel auto-inject script
            (function() {
              console.log('🔧 Main tunnel script injected for ${req.path}');

              function initTunnel() {
                if (typeof window.setupTunnelInterceptors === 'function') {
                  console.log('✅ setupTunnelInterceptors found (main), calling...');
                  window.setupTunnelInterceptors();
                } else if (!document.querySelector('script[src*="frontend.js"]')) {
                  console.log('📥 Loading frontend.js (main)...');
                  var script = document.createElement('script');
                  script.src = '/frontend.js';
                  script.onload = function() {
                    console.log('✅ frontend.js loaded (main)');
                    if (typeof window.setupTunnelInterceptors === 'function') {
                      window.setupTunnelInterceptors();
                    }
                  };
                  document.head.appendChild(script);
                }
              }

              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initTunnel);
              } else {
                setTimeout(initTunnel, 100);
              }
            })();
          </script>
        `;

        // МНОЖЕСТВЕННЫЕ СПОСОБЫ ИНЖЕКЦИИ
        if (body.includes('</body>')) {
          body = body.replace('</body>', `${injectScript}</body>`);
          console.log(`   ✅ Injected before </body>`);
        } else if (body.includes('</html>')) {
          body = body.replace('</html>', `${injectScript}</html>`);
          console.log(`   ✅ Injected before </html>`);
        } else {
          // Если не нашли теги, добавляем перед первым script или в конец
          const scriptMatch = body.match(/<script[\s\S]*?<\/script>/i);
          if (scriptMatch) {
            body = body.replace(scriptMatch[0], `${injectScript}${scriptMatch[0]}`);
            console.log(`   ✅ Injected before first script tag`);
          } else {
            body += injectScript;
            console.log(`   ✅ Appended to end of body`);
          }
        }
      } catch (error) {
        console.error(`❌ Error in main injection middleware:`, error);
      }
    }
    return originalSend.call(this, body);
  };
  next();
});
app.use(express.json({ limit: '50mb' }));

// Обработка preflight запросов для API
app.options('/api/*', (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-tunnel-client-id, cookie, authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// Логирование входящих запросов (для отладки)
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content
});
// ==================== gRPC-Web ЭНДПОИНТЫ ====================

// SendFrame
app.post('/tunnel.TunnelService/SendFrame', (req, res) => {
  try {
    // Получаем raw body
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks);
        console.log(`🚨 SERVER: SendFrame request received, body length: ${rawBody.length}`);

        const protoData = parseGrpcWebMessage(rawBody);
        const request = tunnelProto.SendFrameRequest.deserializeBinary(protoData);

        const frame = request.getFrame();
        const clientId = request.getClientId();
        const frameId = frame.getFrameId();

        // Проверяем не обрабатывали ли уже этот фрейм
        const frameKey = `${clientId}_${frameId}`;
        if (processedFrames.has(frameKey)) {
          console.log(`⚠️  Duplicate frame ${frameId} from ${clientId}, ignoring`);
          const response = new tunnelProto.SendFrameResponse();
          response.setSuccess(true);
          response.setMessage('Duplicate frame ignored');
          response.setTimestamp(Date.now());

          const responseBytes = response.serializeBinary();
          const grpcResponse = createGrpcWebResponse(responseBytes);

          res.setHeader('Content-Type', 'application/grpc-web+proto');
          res.setHeader('grpc-status', '0');
          res.send(grpcResponse);
          return;
        }

        processedFrames.set(frameKey, Date.now());

        const frameType = frame.getType();
        const payload = frame.getPayload_asU8();

        switch (frameType) {
          case tunnelProto.FrameType.HTTP_REQUEST:
            forwardHttpRequestToLaptop(frame);
            break;
          case tunnelProto.FrameType.HTTP_RESPONSE:
            handleHttpResponseFrame(frame);
            break;

          case tunnelProto.FrameType.PING:
            console.log(`🏓 Ping from ${clientId}`);
            const pongFrame = new tunnelProto.TunnelFrame();
            pongFrame.setFrameId(`pong_${Date.now()}_${frame.getFrameId()}`);
            pongFrame.setType(tunnelProto.FrameType.PONG);
            pongFrame.setTimestamp(Date.now());
            addToQueue(clientId, pongFrame);
            break;
        }

        // Отправляем ответ
        const response = new tunnelProto.SendFrameResponse();
        response.setSuccess(true);
        response.setMessage('Frame received');
        response.setTimestamp(Date.now());

        const responseBytes = response.serializeBinary();
        const grpcResponse = createGrpcWebResponse(responseBytes);

        res.setHeader('Content-Type', 'application/grpc-web+proto');
        res.setHeader('grpc-status', '0');
        res.send(grpcResponse);

      } catch (error) {
        console.error('❌ SendFrame error:', error);
        const errorResponse = createGrpcWebError(13, error.message);
        res.setHeader('Content-Type', 'application/grpc-web+proto');
        res.send(errorResponse);
      }
    });

    req.on('error', (error) => {
      console.error('❌ SendFrame request error:', error);
      const errorResponse = createGrpcWebError(13, error.message);
      res.setHeader('Content-Type', 'application/grpc-web+proto');
      res.send(errorResponse);
    });

  } catch (error) {
    console.error('❌ SendFrame error:', error);
    const errorResponse = createGrpcWebError(13, error.message);
    res.setHeader('Content-Type', 'application/grpc-web+proto');
    res.send(errorResponse);
  }
});

// PollFrames
app.post('/tunnel.TunnelService/PollFrames', (req, res) => {
  try {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks);
        const protoData = parseGrpcWebMessage(rawBody);
        const request = tunnelProto.PollRequest.deserializeBinary(protoData);

        const clientId = request.getClientId();
        const tunnelId = request.getTunnelId();
        const lastFrameId = request.getLastFrameId() || '';
        const timeoutMs = Math.min(request.getTimeoutMs() || 3000, 10000); // Уменьшаем timeout

        console.log(`📥 Poll from ${clientId}, lastFrameId: ${lastFrameId || '(none)'}`);

        // Проверяем клиента
        const client = clients.get(clientId);
        const tunnel = tunnels.get(tunnelId);

        if (!client || !tunnel || tunnel.clientId !== clientId) {
          return safeSendPollResponse(clientId, res, [], false, lastFrameId);
        }

        // Получаем сообщения из очереди
        const messages = getMessagesFromQueue(clientId, lastFrameId);

        if (messages.length > 0) {
          // Есть сообщения - сразу отвечаем
          const frames = messages.map(item => item.frame);
          const lastSentFrameId = messages[messages.length - 1]?.id;
          return safeSendPollResponse(clientId, res, frames, false, lastSentFrameId);
        }

        // Нет сообщений - начинаем short polling (не long!)
        console.log(`⏳ No messages for ${clientId}, immediate empty response`);
        safeSendPollResponse(clientId, res, [], false, lastFrameId);

      } catch (error) {
        console.error('❌ PollFrames error:', error);
        if (!res.headersSent) {
          const errorResponse = createGrpcWebError(13, error.message);
          res.setHeader('Content-Type', 'application/grpc-web+proto');
          res.send(errorResponse);
        }
      }
    });

    req.on('error', (error) => {
      console.error('❌ PollFrames request error:', error);
      if (!res.headersSent) {
        const errorResponse = createGrpcWebError(13, error.message);
        res.setHeader('Content-Type', 'application/grpc-web+proto');
        res.send(errorResponse);
      }
    });

  } catch (error) {
    console.error('❌ PollFrames error:', error);
    if (!res.headersSent) {
      const errorResponse = createGrpcWebError(13, error.message);
      res.setHeader('Content-Type', 'application/grpc-web+proto');
      res.send(errorResponse);
    }
  }
});

function forwardHttpRequestToLaptop(frame) {
  try {
    const payload = frame.getPayload_asU8();
    const httpRequest = tunnelProto.HttpRequest.deserializeBinary(payload);
    const requestId = httpRequest.getRequestId();
    const clientId = httpRequest.getMetadataMap().get('client_id');

    // Находим активный laptop клиент
    let activeLaptop = null;
    for (const [id, client] of clients.entries()) {
      if (client.type === 'laptop') {
        activeLaptop = client;
        break;
      }
    }

    if (!activeLaptop) {
      console.log('❌ No active laptop client found');
      // Отправляем ошибку браузеру
      sendErrorToBrowser(requestId, 503, 'No laptop connected');
      return;
    }

    console.log(`📤 Forwarding HTTP request ${requestId} to laptop ${activeLaptop.id}`);

    // Модифицируем фрейм: добавляем metadata с requestId для отслеживания
    const modifiedFrame = new tunnelProto.TunnelFrame();
    modifiedFrame.setFrameId(`forward_${requestId}`);
    modifiedFrame.setType(tunnelProto.FrameType.HTTP_REQUEST);
    modifiedFrame.setTimestamp(Date.now());

    // Создаем metadata для отслеживания
    const metadataMap = modifiedFrame.getMetadataMap();
    metadataMap.set('request_id', requestId);
    metadataMap.set('browser_client_id', clientId);
    metadataMap.set('forwarded_via', 'server');

    // Сохраняем оригинальный payload
    modifiedFrame.setPayload(payload);

    // Отправляем laptop клиенту
    addToQueue(activeLaptop.id, modifiedFrame);

    // Сохраняем связь requestId → ожидающий response
    pendingRequests.set(requestId, {
      browserId: clientId,
      laptopId: activeLaptop.id,
      forwardedAt: Date.now(),
      originalFrame: frame
    });

    console.log(`✅ Request ${requestId} forwarded to laptop`);

  } catch (error) {
    console.error('❌ Error forwarding HTTP request:', error);
  }
}

// Обрабатываем запрос к Wagtail
async function handleHttpRequest(frame, clientId, tunnelId) {
  try {
    const request = frame.getRequest();
    const path = request.getPath();
    const method = request.getMethod();
    const headers = request.getHeadersList();
    const body = request.getBody_asU8();

    // Извлекаем cookies из заголовков
    let cookieHeader = '';
    for (const header of headers) {
      if (header.getName().toLowerCase() === 'cookie') {
        cookieHeader = header.getValue();
        break;
      }
    }

    // Формируем заголовки для запроса к Wagtail
    const wagtailHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
      'Accept': '*/*',
      'User-Agent': 'gRPC-Tunnel/1.0'
    };

    // Добавляем заголовки из оригинального запроса
    for (const header of headers) {
      const name = header.getName().toLowerCase();
      if (name !== 'cookie' && name !== 'host') {
        wagtailHeaders[header.getName()] = header.getValue();
      }
    }

    const wagtailResponse = await fetch(path, {
      method,
      headers: wagtailHeaders,
      body
    });
    // Получаем тело ответа
    const responseBody = await wagtailResponse.arrayBuffer();

    // Создаем фрейм ответа
    const responseFrame = new tunnelProto.TunnelFrame();
    responseFrame.setFrameId(`resp_${frame.getFrameId()}`);
    responseFrame.setType(tunnelProto.FrameType.HTTP_RESPONSE);
    responseFrame.setTimestamp(Date.now());

    const httpResponse = new tunnelProto.HttpResponse();
    httpResponse.setStatus(wagtailResponse.status);
    httpResponse.setStatusText(wagtailResponse.statusText);

    // Обрабатываем заголовки ответа
    const responseHeaders = [];
    for (const [key, value] of wagtailResponse.headers.entries()) {
      if (key !== 'set-cookie') { // Пропускаем set-cookie, обрабатываем отдельно
        const header = new tunnelProto.HttpHeader();
        header.setName(key);
        header.setValue(value);
        responseHeaders.push(header);
      }
    }

    // Добавляем Set-Cookie в заголовки ответа для клиента
    if (setCookieHeader) {
      const setCookieHeaderObj = new tunnelProto.HttpHeader();
      setCookieHeaderObj.setName('Set-Cookie');
      setCookieHeaderObj.setValue(setCookieHeader);
      responseHeaders.push(setCookieHeaderObj);
    }

    httpResponse.setHeadersList(responseHeaders);
    httpResponse.setBody(new Uint8Array(responseBody));

    responseFrame.setPayload(httpResponse.serializeBinary());

    // Отправляем ответ клиенту
    addToQueue(clientId, responseFrame);

  } catch (error) {
    console.error('❌ Error in handleHttpRequest:', error);
    // Отправляем ошибку клиенту
    const errorFrame = new tunnelProto.TunnelFrame();
    errorFrame.setFrameId(`error_${Date.now()}`);
    errorFrame.setType(tunnelProto.FrameType.HTTP_RESPONSE);
    errorFrame.setTimestamp(Date.now());

    const httpResponse = new tunnelProto.HttpResponse();
    httpResponse.setStatus(500);
    httpResponse.setStatusText('Internal Server Error');
    httpResponse.setBody(new Uint8Array(new TextEncoder().encode(error.message)));

    errorFrame.setPayload(httpResponse.serializeBinary());
    addToQueue(clientId, errorFrame);
  }
}


function handleHttpResponseFrame(frame) {
  try {
    const payload = frame.getPayload_asU8();
    const httpResponse = tunnelProto.HttpResponse.deserializeBinary(payload);

    const requestId = httpResponse.getRequestId();
    const statusCode = httpResponse.getStatus();

    // Проверяем, это sync запрос?
    if (requestId.startsWith('sync_session_')) {
      console.log(`🔄 Processing sync response for ${requestId}`);

      const pendingRequest = pendingRequests.get(requestId);
      if (!pendingRequest) {
        console.log(`⚠️  No pending sync request for ${requestId}`);
        return;
      }

      const headers = JSON.parse(httpResponse.getHeaders() || '{}');

      // Извлекаем куки
      const metadataMap = frame.getMetadataMap();
      const cookies = [];

      if (metadataMap) {
        const cookiesJson = metadataMap.get('cookies');
        if (cookiesJson) {
          try {
            const parsed = JSON.parse(cookiesJson);
            if (Array.isArray(parsed)) {
              parsed.forEach(cookie => {
                if (typeof cookie === 'string' && cookie.trim()) {
                  cookies.push(cookie.trim());
                }
              });
            }
          } catch (e) {
            console.error('Error parsing cookies:', e.message);
          }
        }
      }

      console.log(`📥 Sync response ${requestId}: status=${statusCode}, cookies=${cookies.length}`);

      if (cookies.length > 0) {
        cookies.forEach((cookie, idx) => {
          if (cookie.includes('sessionid=')) {
            console.log(`🎉 Session cookie found in sync response!`);
            const match = cookie.match(/sessionid=([^;]+)/);
            if (match) {
              console.log(`   Session ID: ${match[1].substring(0, 30)}...`);
            }
          }
        });
      }

      // Удаляем из pending
      pendingRequests.delete(requestId);

      console.log(`✅ Sync request ${requestId} completed`);
      return;
    }

    // Обработка обычных запросов
    const frameId = frame.getFrameId();
    const responseKey = `${requestId}_${frameId}`;

    if (processedResponses.has(responseKey)) {
      console.log(`⚠️  Duplicate response frame ${frameId} for ${requestId}`);
      return;
    }

    processedResponses.add(responseKey);

    // Находим ожидающий запрос
    const pendingRequest = pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.log(`⚠️  No pending request found for ${requestId}`);
      return;
    }

    // Удаляем из ожидающих
    pendingRequests.delete(requestId);

    setTimeout(() => {
      processedResponses.delete(responseKey);
    }, 300000);

    // Парсим заголовки
    const headers = JSON.parse(httpResponse.getHeaders() || '{}');
    let body = httpResponse.getBody();
    const finalHeaders = { ...headers };

    // ДЛЯ СТАТИКИ - ОСОБАЯ ОБРАБОТКА
    if (pendingRequest.isStatic) {
      console.log(`📁 Processing static file: ${pendingRequest.originalPath}`);

      // ВАЖНО: Устанавливаем правильный Content-Type
      const contentType = pendingRequest.contentType || getContentType(pendingRequest.originalPath);
      finalHeaders['content-type'] = contentType;

      // Убираем все HTML-инжекции для статики
      finalHeaders['Cache-Control'] = 'public, max-age=300'; // Кэшируем статику

      // CORS
      finalHeaders['Access-Control-Allow-Origin'] = '*';
      finalHeaders['Access-Control-Allow-Credentials'] = 'true';

      // Тело ответа
      let body = httpResponse.getBody_asU8();
      if (!body || body.length === 0) {
        body = Buffer.from('');
      }

      // Отправляем ответ
      if (!pendingRequest.res.headersSent) {
        pendingRequest.res.writeHead(statusCode, finalHeaders);

        if (Buffer.isBuffer(body)) {
          pendingRequest.res.end(body);
        } else if (body instanceof Uint8Array) {
          pendingRequest.res.end(Buffer.from(body));
        } else {
          pendingRequest.res.end('');
        }

        console.log(`✅ Static file sent: ${pendingRequest.originalPath}, type: ${contentType}`);
      }

      return; // ВЫХОДИМ, НЕ ПРОДОЛЖАЕМ HTML ОБРАБОТКУ
    }
    // Извлекаем куки из метаданных фрейма
    const metadataMap = frame.getMetadataMap();
    const cookies = [];

    if (metadataMap && metadataMap.getLength() > 0) {
      try {
        const cookiesJson = metadataMap.get('cookies');
        if (cookiesJson) {
          const parsedCookies = JSON.parse(cookiesJson);
          if (Array.isArray(parsedCookies)) {
            parsedCookies.forEach(cookie => {
              if (typeof cookie === 'string' && cookie.trim()) {
                cookies.push(cookie.trim());
              }
            });
          }
        }
      } catch (error) {
        console.error('❌ Error parsing cookies metadata:', error);
      }
    }

    console.log(`📥 HTTP Response for ${requestId}: status=${statusCode}, cookies=${cookies.length}`);

    if (cookies.length > 0) {
      console.log(`🍪 Cookies to set: ${cookies.length}`);

      cookies.forEach((cookie, idx) => {
        if (cookie.includes('csrftoken=')) {
          const match = cookie.match(/csrftoken=([^;]+)/);
          if (match) {
            console.log(`   CSRF Token ${idx}: ${match[1].substring(0, 20)}...`);
          }
        }
        if (cookie.includes('sessionid=')) {
          console.log(`   🎉🎉🎉 Session cookie found at index ${idx} 🎉🎉🎉`);
          const match = cookie.match(/sessionid=([^;]+)/);
          if (match) {
            console.log(`      Session ID: ${match[1].substring(0, 30)}...`);
            console.log(`      Session length: ${match[1].length} chars`);
          }
        }
      });
    }

    // Content-Type по умолчанию
    if (!finalHeaders['content-type'] && !finalHeaders['Content-Type']) {
      const path = pendingRequest.res.req?.path || '';
      if (path.endsWith('.css')) {
        finalHeaders['content-type'] = 'text/css; charset=utf-8';
      } else if (path.endsWith('.js')) {
        finalHeaders['content-type'] = 'application/javascript; charset=utf-8';
      } else if (path.endsWith('.html') || path.includes('/accounts/')) {
        finalHeaders['content-type'] = 'text/html; charset=utf-8';
      } else {
        finalHeaders['content-type'] = 'text/plain; charset=utf-8';
      }
    }

    // Добавляем CORS заголовки
    finalHeaders['Access-Control-Allow-Origin'] = '*';
    finalHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    finalHeaders['Access-Control-Allow-Headers'] = 'Content-Type, x-tunnel-client-id, cookie, authorization, x-requested-with';
    finalHeaders['Access-Control-Expose-Headers'] = 'Content-Length, Content-Type, set-cookie, location';
    finalHeaders['Access-Control-Allow-Credentials'] = 'true';

    // Против кэширования для динамических страниц
    const path = pendingRequest.res.req?.path || '';
    if (path.includes('/accounts/') || path.includes('/admin/')) {
      finalHeaders['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      finalHeaders['Pragma'] = 'no-cache';
      finalHeaders['Expires'] = '0';
    }

    // Добавляем куки в заголовки
    if (cookies.length > 0) {
      finalHeaders['Set-Cookie'] = cookies.length === 1 ? cookies[0] : cookies;
      console.log(`✅ Added ${cookies.length} cookies to response headers`);

      // Специальное логирование для sessionid
      cookies.forEach(cookie => {
        if (cookie.includes('sessionid=')) {
          console.log(`🎉🎉🎉 SESSIONID WILL BE SET IN BROWSER! 🎉🎉🎉`);
        }
      });
    }

    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const isHtml = contentType.includes('text/html');

    // ИНЖЕКТИРУЕМ СКРИПТ ЕСЛИ ЭТО HTML
    if (isHtml && body) {
      console.log(`🔧 HTML response detected for ${requestId}, preparing to inject script...`);

      try {
        // Конвертируем body в строку если нужно
        let bodyStr;
        if (typeof body === 'string') {
          bodyStr = body;
        } else if (Buffer.isBuffer(body)) {
          bodyStr = body.toString('utf-8');
        } else if (body instanceof Uint8Array) {
          bodyStr = new TextDecoder().decode(body);
        } else {
          console.log(`⚠️  Unknown body type for ${requestId}:`, typeof body);
          bodyStr = String(body);
        }
        // Удаляем debug toolbar ДО инжекции
        bodyStr = bodyStr.replace(/<link[^>]*debug_toolbar[^>]*>/gi, '');
        bodyStr = bodyStr.replace(/<script[^>]*debug_toolbar[^>]*>[\s\S]*?<\/script>/gi, '');
        bodyStr = bodyStr.replace(/<div[^>]*class="djdt-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        bodyStr = bodyStr.replace(/<div[^>]*id="djDebug"[^>]*>[\s\S]*?<\/div>/gi, '');
        bodyStr = bodyStr.replace(/<li[^>]*id="djdt-[^"]*"[^>]*>[\s\S]*?<\/li>/gi, '');
        bodyStr = bodyStr.replace(/<input[^>]*data-cookie="djdt[^"]*"[^>]*>/gi, '');
        const injectScript = `
          <script>
            (function() {
              console.log('🔧 Tunnel script injected for ${requestId}');

              function initTunnel() {
                if (typeof window.setupTunnelInterceptors === 'function') {
                  console.log('✅ setupTunnelInterceptors found, calling...');
                  window.setupTunnelInterceptors();
                } else if (!document.querySelector('script[src*="frontend.js"]')) {
                  console.log('📥 Loading frontend.js...');
                  var script = document.createElement('script');
                  script.src = '/frontend.js';
                  script.onload = function() {
                    console.log('✅ frontend.js loaded');
                    if (typeof window.setupTunnelInterceptors === 'function') {
                      window.setupTunnelInterceptors();
                    }
                  };
                  script.onerror = function(e) {
                    console.error('❌ Failed to load frontend.js:', e);
                    // Пробуем альтернативный путь
                    var fallback = document.createElement('script');
                    fallback.src = window.location.origin + '/frontend.js';
                    document.head.appendChild(fallback);
                  };
                  document.head.appendChild(script);
                }
              }

              // Запускаем сразу если DOM уже загружен
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initTunnel);
              } else {
                setTimeout(initTunnel, 100);
              }
            })();
          </script>
        `;

        // МЕТОД 1: Ищем </body>
        if (bodyStr.includes('</body>')) {
          bodyStr = bodyStr.replace('</body>', `${injectScript}</body>`);
          console.log(`✅ Script injected before </body> for ${requestId}`);
        }
        // МЕТОД 2: Ищем </html>
        else if (bodyStr.includes('</html>')) {
          bodyStr = bodyStr.replace('</html>', `${injectScript}</html>`);
          console.log(`✅ Script injected before </html> for ${requestId}`);
        }
        // МЕТОД 3: Просто добавляем в конец
        else {
          console.log(`⚠️  No </body> or </html> found for ${requestId}, appending to end`);
          bodyStr += injectScript;
        }
        if (finalHeaders['content-length']) {
        finalHeaders['content-length'] = Buffer.byteLength(bodyStr, 'utf-8');
        }
        // Обновляем тело
        body = Buffer.from(bodyStr, 'utf-8');

      } catch (injectError) {
        console.error(`❌ Error injecting script for ${requestId}:`, injectError);
        // Продолжаем без инжекции
      }
    }
    // Отправляем ответ браузеру
    if (!pendingRequest.res.headersSent && !pendingRequest.res.writableEnded) {
      try {
        // Устанавливаем заголовки
        pendingRequest.res.writeHead(statusCode, finalHeaders);

        // Отправляем тело
        if (body) {
          if (Buffer.isBuffer(body)) {
            pendingRequest.res.end(body);
          } else if (body instanceof Uint8Array) {
            pendingRequest.res.end(Buffer.from(body));
          } else if (typeof body === 'string') {
            pendingRequest.res.end(body);
          } else {
            pendingRequest.res.end('');
          }
        } else {
          pendingRequest.res.end('');
        }

        console.log(`✅ Response sent to browser for ${requestId} with ${cookies.length} cookies`);

      } catch (sendError) {
        console.error(`❌ Error sending response for ${requestId}:`, sendError);

        // Если ошибка, пытаемся отправить простой ответ
        if (!pendingRequest.res.headersSent) {
          pendingRequest.res.statusCode = 500;
          pendingRequest.res.end('Internal Server Error');
        }
      }
    } else {
      console.log(`⚠️  Response stream already closed for ${requestId}`);
    }

  } catch (error) {
    console.error('❌ Error handling HTTP response:', error);
    console.error('Stack:', error.stack);
  }
}

function safeSendPollResponse(clientId, res, frames, hasMore, lastFrameId) {
  if (res.headersSent || res.writableEnded) {
    console.log(`⚠️  Response already sent for ${clientId}, skipping`);
    return false;
  }

  try {
    const response = new tunnelProto.PollResponse();
    response.setFramesList(frames);
    response.setHasMore(false);
    response.setNextPollIn("1000"); // Следующий poll через 1 секунду

    const responseBytes = response.serializeBinary();
    const grpcResponse = createGrpcWebResponse(responseBytes);

    res.setHeader('Content-Type', 'application/grpc-web+proto');
    res.setHeader('grpc-status', '0');

    res.removeHeader('Content-Length');
    res.removeHeader('Transfer-Encoding');

    res.send(grpcResponse);

    // Подтверждаем обработку фреймов
    if (frames.length > 0 && lastFrameId) {
      acknowledgeFrames(clientId, lastFrameId);
    }

    console.log(`📤 Sent ${frames.length} frame(s) to ${clientId}`);

    return true;
  } catch (error) {
    console.error(`❌ Error sending poll response to ${clientId}:`, error.message);
    return false;
  }
}

// Register
app.post('/tunnel.TunnelService/Register', (req, res) => {
  try {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks);
        console.log('📝 Register request received');

        const protoData = parseGrpcWebMessage(rawBody);
        const request = tunnelProto.RegistrationRequest.deserializeBinary(protoData);

        const clientId = request.getClientId() || `client_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const clientType = request.getClientType();
        const clientTypeStr = clientType === tunnelProto.ClientType.LAPTOP ? 'laptop' : 'browser';
        const tunnelId = clientType === tunnelProto.ClientType.LAPTOP ?
          `tunnel_${Date.now()}_${crypto.randomBytes(8).toString('hex')}` : '';

        console.log(`📋 Registration: ${clientId} (${clientTypeStr})`);

        // Сохраняем клиента
        clients.set(clientId, {
          id: clientId,
          type: clientTypeStr,
          clientType: clientType,
          connectedAt: new Date(),
          lastSeen: Date.now()
        });

        // Для laptop создаем туннель
        if (clientType === tunnelProto.ClientType.LAPTOP) {
          tunnels.set(tunnelId, {
            id: tunnelId,
            clientId,
            createdAt: new Date(),
            lastActivity: Date.now()
          });

          // Инициализируем очередь
          messageQueues.set(clientId, []);

          // Создаем welcome сообщение
          const welcomeFrame = new tunnelProto.TunnelFrame();
          const welcomeId = `welcome_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
          welcomeFrame.setFrameId(welcomeId);
          welcomeFrame.setType(tunnelProto.FrameType.DATA);
          welcomeFrame.setTimestamp(Date.now());

          const welcomePayload = Buffer.from(JSON.stringify({
            type: 'welcome',
            message: 'Connected',
            timestamp: Date.now()
          }));

          welcomeFrame.setPayload(welcomePayload);

          // Добавляем welcome в очередь
          addToQueue(clientId, welcomeFrame);
        }

        // Создаем ответ
        const response = new tunnelProto.RegistrationResponse();
        response.setClientId(clientId);
        response.setTunnelId(tunnelId);
        response.setServerVersion('1.0.0-fast');
        response.setSuccess(true);
        response.setMessage(`Registration successful for ${clientTypeStr}`);
        response.setTimestamp(Date.now());

        const responseBytes = response.serializeBinary();
        const grpcResponse = createGrpcWebResponse(responseBytes);

        res.setHeader('Content-Type', 'application/grpc-web+proto');
        res.setHeader('grpc-status', '0');

        console.log(`✅ ${clientTypeStr.toUpperCase()} registered: ${clientId}${tunnelId ? `, tunnel: ${tunnelId}` : ''}`);
        res.send(grpcResponse);

      } catch (error) {
        console.error('❌ Register error:', error);
        const errorResponse = createGrpcWebError(13, error.message);
        res.setHeader('Content-Type', 'application/grpc-web+proto');
        res.send(errorResponse);
      }
    });

    req.on('error', (error) => {
      console.error('❌ Register request error:', error);
      const errorResponse = createGrpcWebError(13, error.message);
      res.setHeader('Content-Type', 'application/grpc-web+proto');
      res.send(errorResponse);
    });

  } catch (error) {
    console.error('❌ Register error:', error);
    const errorResponse = createGrpcWebError(13, error.message);
    res.setHeader('Content-Type', 'application/grpc-web+proto');
    res.send(errorResponse);
  }
});

// ==================== HTTP ЭНДПОИНТЫ ====================


app.post('/api/register-browser', express.json(), (req, res) => {
  try {
    const browserId = `browser_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    clients.set(browserId, {
      id: browserId,
      type: 'browser',
      clientType: 2,
      connectedAt: new Date(),
      lastSeen: Date.now()
    });

    console.log(`✅ BROWSER registered: ${browserId}`);

    // ИСПРАВЛЕНИЕ: Устанавливаем cookie с client_id
    res.cookie('tunnel_client_id', browserId, {
      maxAge: 24 * 60 * 60 * 1000, // 24 часа
      httpOnly: false, // Доступно из JS
      sameSite: 'Lax',
      path: '/'
    });

    res.json({
      clientId: browserId,
      success: true,
      message: 'Browser registration successful',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Browser registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      timestamp: Date.now()
    });
  }
});
app.get('/api/restore-session', (req, res) => {
  try {
    const clientId = req.cookies?.tunnel_client_id || req.headers['x-tunnel-client-id'];

    if (!clientId) {
      return res.status(404).json({
        success: false,
        message: 'No session found',
        timestamp: Date.now()
      });
    }

    // Проверяем существует ли клиент
    const client = clients.get(clientId);

    if (!client) {
      // Удаляем невалидный cookie
      res.clearCookie('tunnel_client_id');
      return res.status(404).json({
        success: false,
        message: 'Session expired',
        timestamp: Date.now()
      });
    }

    // Обновляем lastSeen
    client.lastSeen = Date.now();

    return res.json({
      success: true,
      clientId: clientId,
      type: client.type,
      connectedAt: client.connectedAt,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Restore session error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      timestamp: Date.now()
    });
  }
});
app.post('/api/sync-session', express.json(), async (req, res) => {
  try {
    const { clientId } = req.body;

    console.log(`🔄 Sync session request for client: ${clientId}`);

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'clientId is required',
        timestamp: Date.now()
      });
    }

    // Находим активный laptop клиент
    let laptopClient = null;
    for (const [id, client] of clients.entries()) {
      if (client.type === 'laptop') {
        laptopClient = client;
        break;
      }
    }

    if (!laptopClient) {
      return res.status(503).json({
        success: false,
        error: 'No laptop client connected',
        timestamp: Date.now()
      });
    }

    console.log(`✅ Found laptop client: ${laptopClient.id}`);

    // Создаем уникальный ID запроса
    const requestId = `sync_session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Создаем HTTP запрос к wagtail
    const httpRequest = new tunnelProto.HttpRequest();
    httpRequest.setRequestId(requestId);
    httpRequest.setMethod('GET');
    httpRequest.setPath('/');
    httpRequest.setHeaders(JSON.stringify({
      'User-Agent': 'Tunnel-Session-Sync/1.0',
      'Accept': 'text/html',
      'Connection': 'close'
    }));
    httpRequest.setBody(Buffer.from(''));
    httpRequest.setQuery('{}');

    // Создаем фрейм
    const frame = new tunnelProto.TunnelFrame();
    frame.setFrameId(`frame_${requestId}`);
    frame.setType(tunnelProto.FrameType.HTTP_REQUEST);
    frame.setTimestamp(Date.now());
    frame.setPayload(httpRequest.serializeBinary());

    // Сохраняем ожидающий запрос с callback
    pendingRequests.set(requestId, {
      res,
      browserId: clientId,
      requestedAt: Date.now(),
      laptopId: laptopClient.id
    });

    // Таймаут 10 секунд
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        if (!res.headersSent) {
          res.status(504).json({
            success: false,
            error: 'Sync timeout - no response from wagtail',
            requestId,
            timestamp: Date.now()
          });
        }
      }
    }, 10000);

    // Очистка при закрытии соединения
    res.on('close', () => {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
    });

    // Отправляем запрос laptop клиенту
    addToQueue(laptopClient.id, frame);

    console.log(`📤 Sync request ${requestId} sent to laptop ${laptopClient.id}`);

    // Отправляем immediate response
    res.json({
      success: true,
      message: 'Session sync initiated',
      requestId: requestId,
      laptopId: laptopClient.id,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Sync session error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
});

app.get('/api/sync-status/:requestId', (req, res) => {
  const { requestId } = req.params;

  if (pendingRequests.has(requestId)) {
    res.json({
      status: 'pending',
      requestId,
      timestamp: Date.now()
    });
  } else {
    res.json({
      status: 'completed',
      requestId,
      timestamp: Date.now()
    });
  }
});

// HTTP прокси для браузеров
app.all('/tunnel/*', async (req, res) => {
  try {
    const path = req.path.replace('/tunnel/', '') || '/';
    console.log('\n' + '='.repeat(80));
    console.log('🔍 TUNNEL REQUEST HEADERS:');
    console.log('   Method:', req.method);
    console.log('   Path:', path);
    console.log('   Client ID:', req.headers['x-tunnel-client-id']);
    console.log('   Cookies:', req.headers.cookie || 'None');
        const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
                                '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp', '.avif'];
        const isStaticFile = staticExtensions.some(ext => path.toLowerCase().endsWith(ext)) ||
                           path.includes('/static/') ||
                           path.includes('/media/') ||
                           path.includes('/admin/static/');

        if (isStaticFile) {
            console.log(`📁 Static file detected, passing to next middleware: ${path}`);
            return next(); // Передаем следующему middleware (прокси для статики)
        }
    let browserId = null;
        // 1. Из заголовков
        browserId = req.headers['x-tunnel-client-id'];

        // 2. Из query параметров (самый важный для кликов)
        if (!browserId && req.query.client_id) {
            browserId = req.query.client_id;
            console.log(`🔍 Found client_id in query params: ${browserId}`);
        }

        // 3. Из cookies
        if (!browserId && req.cookies?.tunnel_client_id) {
            browserId = req.cookies.tunnel_client_id;
            console.log(`🔍 Found tunnel_client_id in cookies: ${browserId}`);
        }

        // 4. Из Referer
        if (!browserId && req.headers.referer) {
            try {
                const refererUrl = new URL(req.headers.referer);
                const refererParams = new URLSearchParams(refererUrl.search);
                browserId = refererParams.get('client_id');
                if (browserId) {
                    console.log(`🔍 Found client_id in Referer: ${browserId}`);
                }
            } catch (e) {
                // Игнорируем ошибки парсинга URL
            }
        }

        console.log(`🌐 Tunnel request: ${req.method} ${path}, client: ${browserId || 'anonymous'}`);

    if (!browserId && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'tunnel_client_id') {
          browserId = value;
          console.log(`🔍 Found tunnel_client_id in cookies: ${browserId}`);
          break;
        }
      }
    }

    if (!browserId) {
      console.log('⚠️  No client_id found, checking for browser clients...');

      // Ищем активный браузер клиент
      let activeBrowser = null;
      for (const [clientId, client] of clients.entries()) {
        if (client.type === 'browser') {
          activeBrowser = client;
          break;
        }
      }

      if (activeBrowser) {
        console.log(`🔍 Found active browser client: ${activeBrowser.id}`);
        browserId = activeBrowser.id;

        // Добавляем client_id в заголовки ответа для браузера
        res.setHeader('X-Tunnel-Client-ID', browserId);

        // Также устанавливаем cookie для будущих запросов
        res.cookie('tunnel_client_id', browserId, {
          maxAge: 24 * 60 * 60 * 1000, // 24 часа
          httpOnly: false, // Доступно из JS
          sameSite: 'Lax',
          path: '/'
        });

        console.log(`🍪 Set tunnel_client_id cookie: ${browserId}`);
      } else {
        console.log('❌ No browser client registered');
        return res.status(401).json({
          error: 'No tunnel client',
          message: 'Please connect to tunnel first by visiting the homepage',
          action: 'go_to_homepage',
          timestamp: Date.now()
        });
      }
    }
    console.log(`🌐 Tunnel request: ${req.method} ${path}, client: ${browserId}, cookies: ${req.headers.cookie ? 'present' : 'none'}`);
    // Ищем активный laptop
    let activeLaptop = null;
    for (const [clientId, client] of clients.entries()) {
      if (client.type === 'laptop') {
        activeLaptop = client;
        break;
      }
    }

    if (!activeLaptop) {
      return res.status(503).json({
        error: 'No laptop connected',
        message: 'Please connect your laptop client first',
        timestamp: Date.now()
      });
    }

    const requestId = `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Сохраняем ожидающий запрос
    pendingRequests.set(requestId, {
      res,
      browserId,
      requestedAt: Date.now(),
      laptopId: activeLaptop.id,
      method: req.method // Сохраняем метод для отладки
    });


    console.log(`📤 HTTP Request ${requestId} queued for laptop ${activeLaptop.id}`);
    // Таймаут 10 секунд
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        if (!res.headersSent) {
          res.status(504).json({
            error: 'Gateway Timeout',
            message: 'No response from laptop within 10 seconds',
            requestId
          });
        }
      }
    }, 10000);

    // Обрабатываем тело запроса в зависимости от метода
    let requestBody = Buffer.from('');
      const bodyStr = requestBody.toString('utf-8');

      console.log('🔍 POST Body (first 500 chars):');
      console.log(bodyStr.substring(0, 500));
      // Ищем CSRF в теле
      if (bodyStr.includes('csrfmiddlewaretoken')) {
        const csrfMatch = bodyStr.match(/csrfmiddlewaretoken=([^&]+)/);
        if (csrfMatch) {
          console.log(`🔐 CSRF in body: ${csrfMatch[1].substring(0, 20)}...`);
        }
      }

      // Ищем CSRF в cookies
      if (req.headers.cookie) {
        const csrfMatch = req.headers.cookie.match(/csrftoken=([^;]+)/);
        if (csrfMatch) {
          console.log(`🔐 CSRF in cookies: ${csrfMatch[1].substring(0, 20)}...`);
        }
      }

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      // Для методов с телом - собираем raw body
        const chunks = [];

        await new Promise((resolve, reject) => {
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => {
                requestBody = Buffer.concat(chunks);
                console.log(`📦 ${req.method} request body size: ${requestBody.length} bytes`);

                // Важно: для multipart сохраняем Content-Type как есть
                if (req.headers['content-type'] &&
                    req.headers['content-type'].includes('multipart/form-data')) {
                    console.log('📎 Multipart form data detected, preserving original Content-Type');
                    // Не изменяем заголовки для multipart
                }
                resolve();
            });
            req.on('error', reject);
        });

      console.log(`📦 ${req.method} request body size: ${requestBody.length} bytes`);

      // Если это multipart/form-data, добавляем дополнительные заголовки
      if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        console.log('📎 Multipart form data detected');
      }
    } else if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      // Для GET/DELETE тело обычно пустое
      requestBody = Buffer.from('');
    }

    // Создаем HttpRequest protobuf
    const httpRequest = new tunnelProto.HttpRequest();
    httpRequest.setRequestId(requestId);
    httpRequest.setMethod(req.method);

    // Обрабатываем путь
    let cleanPath = path;
    if (cleanPath.startsWith('//')) cleanPath = cleanPath.substring(1);
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
    httpRequest.setPath(cleanPath);

    // Обрабатываем заголовки
    const headers = { ...req.headers };

    // КРИТИЧЕСКИ ВАЖНО: Сохраняем cookies
    if (headers.cookie) {
      console.log('🍪 Forwarding cookies to laptop:', headers.cookie);
    }

    // Убираем технические заголовки
    const headersToRemove = ['host', 'content-length', 'connection', 'accept-encoding'];
    headersToRemove.forEach(header => {
      if (headers[header]) {
        delete headers[header];
      }
    });

    // Для POST/PUT запросов добавляем content-type обратно если есть тело
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') &&
        requestBody.length > 0 &&
        req.headers['content-type']) {
      headers['content-type'] = req.headers['content-type'];
    }

    console.log(`📋 Headers for ${cleanPath} (${req.method}):`, Object.keys(headers));

    httpRequest.setHeaders(JSON.stringify(headers));

    // Обрабатываем query параметры
    const queryParams = { ...req.query };
    delete queryParams.client_id;
    httpRequest.setQuery(JSON.stringify(queryParams));

    // Устанавливаем тело
    httpRequest.setBody(requestBody);

    // Создаем TunnelFrame
    const frame = new tunnelProto.TunnelFrame();
    const frameId = `http_${requestId}`;
    frame.setFrameId(frameId);
    frame.setType(tunnelProto.FrameType.HTTP_REQUEST);
    frame.setTimestamp(Date.now());
    frame.setPayload(httpRequest.serializeBinary());

    // Добавляем в очередь laptop
    addToQueue(activeLaptop.id, frame);

    console.log(`📤 ${req.method} Request ${requestId} added to queue for laptop ${activeLaptop.id}, body: ${requestBody.length} bytes, cookies: ${headers.cookie ? 'yes' : 'no'}`);
    // После отправки HTML, добавляем клиентский скрипт
    // Очистка при закрытии соединения
    res.on('close', () => {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
    });

  } catch (error) {
    console.error('❌ Error forwarding request:', error);

    if (!res.headersSent) {
      const statusCode = error.code === 'ECONNREFUSED' ? 502 : 500;
      res.status(statusCode).json({
        error: 'Bad Gateway',
        message: 'Failed to forward request to laptop',
        details: error.message,
        method: req.method
      });
    }
  }
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ==================== ОСТАЛЬНЫЕ ЭНДПОИНТЫ ====================
app.get('/debug-session', (req, res) => {
  const clientId = req.headers['x-tunnel-client-id'];
  const cookies = req.headers.cookie || 'No cookies';

  console.log('🔍 DEBUG Session Info:');
  console.log('   Client ID:', clientId);
  console.log('   Cookies:', cookies);
  console.log('   Has sessionid:', cookies.includes('sessionid='));
  console.log('   Has csrftoken:', cookies.includes('csrftoken='));

  // Извлекаем sessionid
  const sessionMatch = cookies.match(/sessionid=([^;]+)/);
  const csrfMatch = cookies.match(/csrftoken=([^;]+)/);

  res.json({
    clientId: clientId,
    cookies: cookies,
    sessionid: sessionMatch ? sessionMatch[1].substring(0, 20) + '...' : 'Not found',
    sessionid_length: sessionMatch ? sessionMatch[1].length : 0,
    csrftoken: csrfMatch ? csrfMatch[1].substring(0, 10) + '...' : 'Not found',
    csrftoken_length: csrfMatch ? csrfMatch[1].length : 0,
    timestamp: new Date().toISOString()
  });
});


app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    server: 'gRPC-Web Fast Tunnel Server',
    version: '1.0.0-fast',
    timestamp: new Date().toISOString(),
    stats: {
      clients: clients.size,
      tunnels: tunnels.size,
      messageQueues: Array.from(messageQueues.entries()).reduce((acc, [key, val]) => {
        acc[key] = val.length;
        return acc;
      }, {}),
      pendingRequests: pendingRequests.size
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    grpc: true,
    polling: true,
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// ==================== ЗАПУСК СЕРВЕРА ====================

async function startServer() {
  try {
    tunnelProto = await loadProtobuf();
    console.log('✅ Protobuf модули загружены');

    const PORT = process.env.PORT || 3003;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
🚀 gRPC-Web Fast Tunnel Server
📡 Port: ${PORT}
🌐 Endpoints:
   POST /tunnel.TunnelService/Register      - Регистрация
   POST /tunnel.TunnelService/SendFrame     - Отправка фрейма
   POST /tunnel.TunnelService/PollFrames    - Получение фреймов (short polling)
   POST /api/register-browser               - Регистрация браузера
   ALL  /tunnel/*                           - HTTP proxy to laptop

📊 Особенности:
   • Short polling (без long polling ожидания)
   • Быстрая доставка сообщений
   • Поддержка cookies и CSRF
   • Автоматическая очистка
      `);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
