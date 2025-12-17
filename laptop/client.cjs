// laptop/client.cjs - упрощенная рабочая версия с обработкой кук
const { EventEmitter } = require('events');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Патч для Node.js
if (typeof self === 'undefined') {
  global.self = global;
}

// Импортируем grpc-web
const { grpc } = require('@improbable-eng/grpc-web');
const { NodeHttpTransport } = require('@improbable-eng/grpc-web-node-http-transport');

// Импортируем protobuf
const tunnelProto = require('../proto/tunnel_pb.cjs');

class FastGrpcTunnelClient {
  constructor(config) {
    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:3003',
      localAppUrl: config.localAppUrl || 'http://localhost:8100',
      pollInterval: 1000, // Poll каждую секунду
      debug: config.debug || false,
      ...config
    };

    // Состояние
    this.clientId = null;
    this.tunnelId = null;
    this.isConnected = false;
    this.isPolling = false;
    this.lastFrameId = null;

    // Для отслеживания
    this.processedRequests = new Set();
    this.receivedFrames = new Set();
    this.pollCount = 0;
    this.errorCount = 0;
    this.requestsForwarded = 0;

    // Хранилище кук (аналогично WebRTC версии)
    this.cookieJar = new Map();
    this.lastIncomingCookies = '';

    // HTTP агенты
    this.localAppUrl = new URL(this.config.localAppUrl);
    this.httpAgent = this.localAppUrl.protocol === 'https:'
      ? new https.Agent({ keepAlive: true })
      : new http.Agent({ keepAlive: true });

    // Таймеры
    this.pollTimer = null;

    console.log('🖥️  Fast gRPC-Web Tunnel Client');
    console.log(`🔗 Server: ${this.config.serverUrl}`);
    console.log(`🏠 Local App: ${this.localAppUrl.toString()}`);
  }

  getStatus() {
    return {
      connected: this.isConnected,
      polling: this.isPolling,
      stats: {
        requestsForwarded: this.processedRequests.size,
        polls: this.pollCount || 0,
        framesReceived: this.receivedFrames.size,
        errors: this.errorCount || 0,
        cookies: this.cookieJar.size
      }
    };
  }

  // ==================== Основные методы ====================

  async connect() {
    try {
      console.log('\n🔗 Connecting to server...');

      // Регистрируемся
      await this.register();

      // Запускаем polling
      this.startPolling();

      this.isConnected = true;
      console.log('✅ Connected to server!');
      console.log(`📊 Client ID: ${this.clientId}`);
      console.log(`🔄 Tunnel ID: ${this.tunnelId}`);

      return true;

    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      return false;
    }
  }

  async register() {
    console.log('📝 Registering...');

    // Генерируем clientId
    const os = require('os');
    this.clientId = `laptop_${os.hostname()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Создаем запрос
    const request = new tunnelProto.RegistrationRequest();
    request.setClientId(this.clientId);
    request.setClientType(tunnelProto.ClientType.LAPTOP);
    request.setLocalAppUrl(this.config.localAppUrl);

    return new Promise((resolve, reject) => {
      const methodDescriptor = {
        methodName: 'Register',
        service: { serviceName: 'tunnel.TunnelService' },
        requestStream: false,
        responseStream: false,
        requestType: tunnelProto.RegistrationRequest,
        responseType: tunnelProto.RegistrationResponse
      };

      grpc.invoke(methodDescriptor, {
        request: request,
        host: this.config.serverUrl,
        transport: NodeHttpTransport(),
        debug: this.config.debug,
        onMessage: (response) => {
          if (response.getSuccess()) {
            this.clientId = response.getClientId();
            this.tunnelId = response.getTunnelId();
            console.log('✅ Registration successful!');
            resolve(response);
          } else {
            reject(new Error(response.getMessage()));
          }
        },
        onEnd: (code, message) => {
          if (code !== grpc.Code.OK) {
            reject(new Error(`gRPC error ${code}: ${message}`));
          }
        }
      });
    });
  }

  // ==================== Polling механизм ====================

  startPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    console.log('🔄 Starting polling...');
    this.isPolling = true;

    // Первый poll сразу
    setTimeout(() => {
      this.pollFrames();
    }, 100);

    // Регулярный polling
    this.pollTimer = setInterval(() => {
      if (this.isConnected && this.isPolling) {
        this.pollFrames();
      }
    }, this.config.pollInterval);
  }

  async pollFrames() {
    if (!this.clientId || !this.tunnelId) {
      return;
    }

    this.pollCount = (this.pollCount || 0) + 1;
    const pollId = `poll_${Date.now()}`;

    try {
      const request = new tunnelProto.PollRequest();
      request.setClientId(this.clientId);
      request.setTunnelId(this.tunnelId);
      request.setLastFrameId(this.lastFrameId || '');
      request.setTimeoutMs(2000); // Короткий timeout

      const response = await new Promise((resolve, reject) => {
        const methodDescriptor = {
          methodName: 'PollFrames',
          service: { serviceName: 'tunnel.TunnelService' },
          requestStream: false,
          responseStream: false,
          requestType: tunnelProto.PollRequest,
          responseType: tunnelProto.PollResponse
        };

        const timeoutId = setTimeout(() => {
          reject(new Error('Poll timeout'));
        }, 3000);

        const call = grpc.invoke(methodDescriptor, {
          request: request,
          host: this.config.serverUrl,
          transport: NodeHttpTransport(),
          debug: this.config.debug,
          onMessage: (response) => {
            clearTimeout(timeoutId);
            resolve(response);
          },
          onEnd: (code, message) => {
            clearTimeout(timeoutId);
            if (code === grpc.Code.OK) {
              resolve(new tunnelProto.PollResponse());
            } else {
              reject(new Error(`Poll error ${code}: ${message}`));
            }
          }
        });
      });

      // Обрабатываем ответ
      this.handlePollResponse(response);

    } catch (error) {
      // Игнорируем таймауты - это нормально
      if (!error.message.includes('timeout')) {
        console.error(`❌ Poll failed:`, error.message);
      }
    }
  }

  handlePollResponse(response) {
    const frames = response.getFramesList();

    if (frames.length === 0) {
      return;
    }

    console.log(`📥 Received ${frames.length} frame(s) from server`);

    for (const frame of frames) {
      const frameId = frame.getFrameId();
      const frameType = frame.getType();

      // Пропускаем дубликаты
      if (this.receivedFrames.has(frameId)) {
        continue;
      }
      this.receivedFrames.add(frameId);

      // Обновляем lastFrameId
      this.lastFrameId = frameId;

      // Обрабатываем фрейм
      try {
        if (frameType === tunnelProto.FrameType.HTTP_REQUEST) {
          this.handleHttpRequest(frame);
        } else if (frameType === tunnelProto.FrameType.DATA) {
          this.handleDataFrame(frame);
        }
      } catch (error) {
        console.error(`❌ Error handling frame ${frameId}:`, error);
      }
    }
  }

  handleDataFrame(tunnelFrame) {
    try {
      const payload = tunnelFrame.getPayload_asU8();
      const data = JSON.parse(Buffer.from(payload).toString());
      if (data.type === 'welcome') {
        console.log('👋 Server welcome');
      }
    } catch (error) {
      // Игнорируем
    }
  }

  // ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С КУКАМИ ====================

// Убедитесь, что extractCookies сохраняет sessionid
extractCookies(headers) {
  const cookies = [];

  if (headers['set-cookie']) {
    let setCookieHeaders = headers['set-cookie'];

    if (!Array.isArray(setCookieHeaders)) {
      setCookieHeaders = this.splitSetCookieHeaders(setCookieHeaders);
    }

    console.log(`🍪 Processing ${setCookieHeaders.length} Set-Cookie header(s) from wagtail`);

    setCookieHeaders.forEach((cookieHeader, index) => {
      if (!cookieHeader || typeof cookieHeader !== 'string') return;

      cookieHeader = cookieHeader.trim();

      // ВАЖНО: Ищем sessionid
      if (cookieHeader.includes('sessionid=')) {
        console.log(`🎯🎯🎯 FOUND SESSIONID! Index ${index}: ${cookieHeader.substring(0, 80)}...`);

        // Извлекаем sessionid
        const sessionMatch = cookieHeader.match(/sessionid=([^;]+)/);
        if (sessionMatch) {
          console.log(`🎉 Session ID extracted: ${sessionMatch[1].substring(0, 30)}...`);
        }
      }

      cookies.push(cookieHeader);

      // Сохраняем в cookie jar
      try {
        const firstSemicolon = cookieHeader.indexOf(';');
        const nameValuePart = firstSemicolon !== -1
          ? cookieHeader.substring(0, firstSemicolon).trim()
          : cookieHeader.trim();

        const equalsIndex = nameValuePart.indexOf('=');
        if (equalsIndex === -1) return;

        const name = nameValuePart.substring(0, equalsIndex).trim();
        const value = nameValuePart.substring(equalsIndex + 1).trim();

        if (name && value) {
          this.cookieJar.set(name, value);

          if (name === 'sessionid') {
            console.log(`🎉🎉🎉 SAVED SESSIONID TO COOKIE JAR!`);
            console.log(`🎉 Value: ${value.substring(0, 30)}...`);
            console.log(`🎉 Length: ${value.length} chars`);
          }
        }
      } catch (e) {
        console.error('Error parsing cookie:', e);
      }
    });

    // Логируем итог
    console.log(`📊 Cookie Jar: ${this.cookieJar.size} cookies`);
    console.log(`   Has sessionid: ${this.cookieJar.has('sessionid') ? '✅ YES!' : '❌ NO'}`);
    console.log(`   Has csrftoken: ${this.cookieJar.has('csrftoken') ? '✅ YES' : '❌ NO'}`);

  } else {
    console.log('📭 No Set-Cookie headers in wagtail response');
  }

  return cookies;
}

  splitSetCookieHeaders(headerString) {
    if (!headerString) return [];

    const cookies = [];
    const parts = headerString.split(',');

    for (let i = 0; i < parts.length; i++) {
      let cookie = parts[i].trim();

      // Если cookie начинается с атрибута, присоединяем к предыдущей
      if (i > 0 && (cookie.toLowerCase().startsWith('httponly') ||
                     cookie.toLowerCase().startsWith('samesite') ||
                     cookie.toLowerCase().startsWith('secure') ||
                     cookie.toLowerCase().startsWith('max-age') ||
                     cookie.toLowerCase().startsWith('expires') ||
                     cookie.toLowerCase().startsWith('path') ||
                     cookie.toLowerCase().startsWith('domain'))) {
        cookies[cookies.length - 1] += ', ' + cookie;
      } else {
        cookies.push(cookie);
      }
    }

    return cookies;
  }

  // Функция для создания cookie header из cookie jar
createCookieHeader() {
  const cookies = [];
  let hasSession = false;
  let hasCSRF = false;

  // ВАЖНО: Всегда включаем sessionid если он есть
  for (const [name, value] of this.cookieJar) {
    // Не отправляем устаревшие или некорректные куки
    if (!value || value.trim() === '' || value === 'undefined' || value === 'null') {
      console.log(`⚠️  Skipping invalid cookie: ${name}=${value}`);
      continue;
    }

    cookies.push(`${name}=${value}`);

    if (name === 'sessionid') hasSession = true;
    if (name === 'csrftoken') hasCSRF = true;
  }

  const header = cookies.join('; ');

  if (header) {
    console.log(`🍪 Creating cookie header with ${cookies.length} cookies`);
    console.log(`   Total cookies: ${cookies.length}`);
    console.log(`   Has sessionid: ${hasSession ? '✅ YES!' : '❌ NO'}`);
    console.log(`   Has csrftoken: ${hasCSRF ? '✅ YES' : '❌ NO'}`);

    if (hasSession) {
      const sessionValue = this.cookieJar.get('sessionid');
      console.log(`   🎉 SESSIONID WILL BE SENT: ${sessionValue.substring(0, 30)}...`);
      console.log(`   🎉 Session length: ${sessionValue.length} chars`);
    }

    // Логируем все куки
    cookies.forEach(cookie => {
      const [name] = cookie.split('=');
      if (name === 'sessionid') {
        console.log(`   🎉 Including session cookie`);
      } else if (name === 'csrftoken') {
        console.log(`   🛡️ Including CSRF cookie`);
      }
    });
  } else {
    console.log('🍪 No valid cookies in jar to send');
  }

  return header;
}

  // ==================== HTTP обработка ====================

async handleHttpRequest(tunnelFrame) {
    let requestId = null;
  try {
    // Получаем данные из фрейма
    const payload = tunnelFrame.getPayload_asU8();
    const httpRequest = tunnelProto.HttpRequest.deserializeBinary(payload);
    const requestId = httpRequest.getRequestId();

    // Проверяем дубликаты
    if (this.processedRequests.has(requestId)) {
      console.log(`⚠️  Duplicate request ${requestId}, skipping`);
      return;
    }
    this.processedRequests.add(requestId);

    console.log(`📤 HTTP Request ${requestId}: ${httpRequest.getMethod()} ${httpRequest.getPath()}`);

    // Получаем данные из запроса
    const headers = JSON.parse(httpRequest.getHeaders() || '{}');
    const query = JSON.parse(httpRequest.getQuery() || '{}');
    const bodyBytes = httpRequest.getBody_asU8(); // Получаем как Uint8Array

    // Обрабатываем путь
    let path = httpRequest.getPath();
    if (!path.startsWith('/')) path = '/' + path;

    // Строим URL для wagtail
    const url = new URL(path, this.config.localAppUrl);
    url.search = '';
    Object.entries(query).forEach(([key, value]) => {
      if (key !== 'client_id') {
        url.searchParams.set(key, value);
      }
    });

    console.log(`🔗 Making request to wagtail: ${url.toString()}`);

    // Тело запроса - используем как есть
    let requestBody = Buffer.from(bodyBytes);
    const contentType = headers['content-type'] || headers['Content-Type'] || '';

    // ВАЖНО: Сохраняем sessionid из входящих cookies браузера!
    const clientCookies = headers.cookie || '';
    if (clientCookies) {
      console.log(`🔍 Browser cookies: ${clientCookies.substring(0, 100)}${clientCookies.length > 100 ? '...' : ''}`);

      // Ищем sessionid в cookies браузера
      const sessionMatch = clientCookies.match(/sessionid=([^;]+)/);
      if (sessionMatch && sessionMatch[1]) {
        const browserSessionId = sessionMatch[1];

        // Сохраняем в cookie jar если его нет или он отличается
        if (!this.cookieJar.has('sessionid') ||
            this.cookieJar.get('sessionid') !== browserSessionId) {

          this.cookieJar.set('sessionid', browserSessionId);
          console.log(`🎉 IMPORTED sessionid from browser: ${browserSessionId.substring(0, 30)}...`);
          console.log(`🎉 Session ID length: ${browserSessionId.length} chars`);
        } else {
          console.log(`✅ Browser sessionid matches jar`);
        }
      } else {
        console.log(`⚠️  No sessionid in browser cookies`);
      }

      // Также сохраняем csrftoken из браузера
      const csrfMatch = clientCookies.match(/csrftoken=([^;]+)/);
      if (csrfMatch && csrfMatch[1]) {
        this.cookieJar.set('csrftoken', csrfMatch[1]);
        console.log(`🛡️ Imported csrftoken from browser`);
      }
    } else {
      console.log(`📭 No cookies from browser`);
    }

    // Логируем информацию о запросе
    if (requestBody.length > 0) {
      console.log(`📦 Request body size: ${requestBody.length} bytes`);
      console.log(`📦 Content-Type: ${contentType}`);

      // Для POST форм логируем CSRF токен (но не меняем его!)
      if (contentType.includes('application/x-www-form-urlencoded') &&
          requestBody.length > 0) {

        try {
          const bodyStr = requestBody.toString('utf-8');
          console.log(`🔍 Form body preview: ${bodyStr.substring(0, 150)}...`);

          // Ищем CSRF токен в теле
          if (bodyStr.includes('csrfmiddlewaretoken')) {
            const params = new URLSearchParams(bodyStr);
            const formCsrf = params.get('csrfmiddlewaretoken');
            if (formCsrf) {
              console.log(`🔐 Form CSRF token: ${formCsrf.substring(0, 20)}... (${formCsrf.length} chars)`);
            }
          }

        } catch (error) {
          console.error('❌ Error parsing form data:', error.message);
        }
      }
    }

    // Подготавливаем заголовки для запроса к wagtail
    const wagtailHeaders = { ...headers };

    // Удаляем технические заголовки
    delete wagtailHeaders['host'];
    delete wagtailHeaders['content-length'];
    delete wagtailHeaders['connection'];
    delete wagtailHeaders['accept-encoding'];

    // Убедимся, что есть User-Agent
    if (!wagtailHeaders['user-agent']) {
      wagtailHeaders['user-agent'] = 'gRPC-Tunnel-Client/1.0';
    }

    // Добавляем куки из cookie jar
    const cookieHeader = this.createCookieHeader();
    if (cookieHeader) {
      // Если уже есть куки в заголовках, объединяем, избегая дублирования
      if (wagtailHeaders.cookie) {
        // Разбираем существующие куки
        const existingCookies = wagtailHeaders.cookie.split(';').map(c => c.trim());
        const jarCookies = cookieHeader.split(';').map(c => c.trim());

        // Объединяем, отдавая приоритет кукам из jar (они более актуальны)
        const allCookies = [];
        const seenNames = new Set();

        // Сначала добавляем куки из jar
        jarCookies.forEach(cookie => {
          const name = cookie.split('=')[0];
          if (name && !seenNames.has(name)) {
            allCookies.push(cookie);
            seenNames.add(name);
          }
        });

        // Затем добавляем остальные куки из запроса
        existingCookies.forEach(cookie => {
          const name = cookie.split('=')[0];
          if (name && !seenNames.has(name)) {
            allCookies.push(cookie);
            seenNames.add(name);
          }
        });

        wagtailHeaders.cookie = allCookies.join('; ');
        console.log(`🍪 Merged ${allCookies.length} cookies (${jarCookies.length} from jar)`);
      } else {
        wagtailHeaders.cookie = cookieHeader;
        console.log(`🍪 Added ${this.cookieJar.size} cookies from jar to request`);
      }
    } else {
      console.log(`🍪 No cookies in jar to add`);
    }

    // Логируем финальные заголовки
    console.log(`📋 Final headers for wagtail:`);
    console.log(`   Cookie: ${wagtailHeaders.cookie || 'None'}`);

    // Выполняем запрос к wagtail
    const response = await this.makeLocalRequest({
      method: httpRequest.getMethod(),
      url: url.toString(),
      headers: wagtailHeaders,
      body: requestBody.length > 0 ? requestBody : null
    });

    console.log(`✅ Got response from wagtail: ${response.status} ${response.statusText || ''}`);

    // Извлекаем куки из ответа wagtail
    const cookies = this.extractCookies(response.headers);

    // Отправляем ответ обратно через туннель
    await this.sendHttpResponse(requestId, response, cookies);

    console.log(`✅ Request ${requestId} completed successfully`);

  } catch (error) {
    console.error(`❌ HTTP request failed for ${requestId}:`, error.message);
    console.error('Stack:', error.stack);

    // Отправляем error response
    try {
      if (requestId) {
      const errorFrame = new tunnelProto.TunnelFrame();
      const errorResponse = new tunnelProto.HttpResponse();
      errorResponse.setRequestId(requestId);
      errorResponse.setStatus(500);
      errorResponse.setHeaders(JSON.stringify({
        'content-type': 'text/plain',
        'cache-control': 'no-cache'
      }));
      errorResponse.setBody(Buffer.from(`Error: ${error.message}`));

      errorFrame.setFrameId(`error_${requestId}`);
      errorFrame.setType(tunnelProto.FrameType.HTTP_RESPONSE);
      errorFrame.setTimestamp(Date.now());
      errorFrame.setPayload(errorResponse.serializeBinary());

      await this.sendFrame(errorFrame);
      }
    } catch (sendError) {
      console.error('❌ Failed to send error response:', sendError);
    }
  }
}

// Обновленная функция sendHttpResponse для лучшей передачи кук
async sendHttpResponse(requestId, httpResponse, cookies = []) {
  try {
    const responseProto = new tunnelProto.HttpResponse();
    responseProto.setRequestId(requestId);
    responseProto.setStatus(httpResponse.status);
    responseProto.setHeaders(JSON.stringify(httpResponse.headers || {}));
    responseProto.setBody(httpResponse.body || Buffer.from(''));

    const frame = new tunnelProto.TunnelFrame();
    const frameId = `resp_${requestId}_${Date.now()}`;
    frame.setFrameId(frameId);
    frame.setType(tunnelProto.FrameType.HTTP_RESPONSE);
    frame.setTimestamp(Date.now());

    if (cookies.length > 0) {
      // ВАЖНО: Для sync запросов логируем sessionid
      if (requestId.startsWith('sync_session_')) {
        console.log(`🔄 Sending ${cookies.length} cookies in SYNC response`);

        cookies.forEach((cookie, idx) => {
          if (cookie.includes('sessionid=')) {
            console.log(`🎉 Session cookie in sync response: ${cookie.substring(0, 80)}...`);
          }
        });
      }
      // Добавляем ВСЕ куки в metadata
      frame.getMetadataMap().set('cookies', JSON.stringify(cookies));
    } else {
      console.log(`⚠️  No cookies to send for ${requestId}`);

      // Проверяем, были ли куки в ответе от wagtail
      if (httpResponse.headers['set-cookie']) {
        console.log('❌ ERROR: Cookies were in wagtail response but not extracted!');
        console.log('   Set-Cookie headers:', httpResponse.headers['set-cookie']);
      }
    }

    frame.setPayload(responseProto.serializeBinary());

    await this.sendFrame(frame);
    console.log(`📤 Response sent for ${requestId}, cookies sent: ${cookies.length}`);

  } catch (error) {
    console.error(`❌ Error sending response:`, error);
  }
}

async sendFrame(frame) {
  try {
    const request = new tunnelProto.SendFrameRequest();
    request.setFrame(frame);
    request.setClientId(this.clientId);
    request.setTunnelId(this.tunnelId);

    return new Promise((resolve, reject) => {
      const methodDescriptor = {
        methodName: 'SendFrame',
        service: { serviceName: 'tunnel.TunnelService' },
        requestStream: false,
        responseStream: false,
        requestType: tunnelProto.SendFrameRequest,
        responseType: tunnelProto.SendFrameResponse
      };

      grpc.invoke(methodDescriptor, {
        request: request,
        host: this.config.serverUrl,
        transport: NodeHttpTransport(),
        debug: this.config.debug,
        onMessage: (response) => {
          if (response.getSuccess()) {
            console.log(`✅ Frame sent successfully: ${frame.getFrameId()}`);
            resolve(response);
          } else {
            reject(new Error(response.getMessage()));
          }
        },
        onEnd: (code, message, trailers) => {
          if (code !== grpc.Code.OK) {
            console.error(`❌ SendFrame error: ${code} - ${message}`);
            reject(new Error(`SendFrame error ${code}: ${message}`));
          }
        }
      });
    });
  } catch (error) {
    console.error('❌ Error in sendFrame:', error);
    throw error;
  }
}
  // ==================== HTTP утилиты ====================

async makeLocalRequest(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method,
      headers: options.headers || {},
      agent: this.httpAgent,
      timeout: 30000
    };

    // Очищаем технические заголовки
    delete reqOptions.headers['host'];
    delete reqOptions.headers['content-length'];
    delete reqOptions.headers['connection'];
    delete reqOptions.headers['accept-encoding'];

    // Логируем запрос
    console.log(`🔗 Making local ${reqOptions.method} request to: ${reqOptions.path}`);

    if (reqOptions.headers.cookie) {
      console.log(`🍪 Sending cookies: ${reqOptions.headers.cookie}`);
    }

    if (options.body) {
      console.log(`📦 Request body: ${options.body.length} bytes`);
    }

    const req = httpModule.request(reqOptions, (res) => {
      const chunks = [];

      res.on('data', chunk => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);

        // Собираем заголовки ответа
        const headers = {};
        for (const [key, value] of Object.entries(res.headers)) {
          headers[key.toLowerCase()] = value;
        }

        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: headers,
          body: body
        });

        console.log(`✅ Local response: ${res.statusCode}, size: ${body.length} bytes`);

        if (headers['set-cookie']) {
          console.log(`🍪 Wagtail sent Set-Cookie headers`);
        }
      });

      res.on('error', (err) => {
        console.error('❌ Local response error:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('❌ Local request error:', err);
      reject(err);
    });

    req.on('timeout', () => {
      console.error('❌ Local request timeout');
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (options.body && options.body.length > 0) {
        req.end(options.body);
    } else {
        req.end();
    }
  });
}

  disconnect() {
    console.log('\n👋 Disconnecting...');

    this.isConnected = false;
    this.isPolling = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.httpAgent) {
      this.httpAgent.destroy();
    }

    // Очищаем cookie jar
    this.cookieJar.clear();

    console.log('✅ Disconnected');
  }
}

module.exports = FastGrpcTunnelClient;
