import express from 'express';
import { ObfuscationRotator } from '../obfuscation/rotator.js';
import { DataMasker } from '../utils/masking.js';

export class GrpcWebHandler {
  constructor(tunnelServer) {
    this.tunnelServer = tunnelServer;
    this.obfuscator = new ObfuscationRotator();
    this.masker = new DataMasker();
    this.router = express.Router();
    
    this.setupRoutes();
  }
  
  setupRoutes() {
    // gRPC-Web endpoint
    this.router.post('/tunnel.TunnelService/TunnelStream', this.handleTunnelStream.bind(this));
    this.router.post('/tunnel.TunnelService/HttpProxy', this.handleHttpProxy.bind(this));
    this.router.post('/tunnel.TunnelService/Register', this.handleRegister.bind(this));
    
    // Совместимость со старым API
    this.router.post('/api/tunnel', this.handleLegacyTunnel.bind(this));
  }
  
  // Обработка gRPC-Web стрима
  async handleTunnelStream(req, res) {
    try {
      console.log('📡 gRPC-Web TunnelStream request');
      
      // В реальности здесь обработка бинарного gRPC-Web
      // Для упрощения используем JSON
      
      const contentType = req.headers['content-type'] || '';
      const isGrpcWeb = contentType.includes('application/grpc-web-text');
      
      if (isGrpcWeb) {
        // TODO: Реальная обработка gRPC-Web бинарного формата
        res.setHeader('Content-Type', 'application/grpc-web-text+proto');
        res.status(200).end();
      } else {
        // JSON fallback
        await this.handleJsonTunnel(req, res);
      }
      
    } catch (error) {
      console.error('❌ TunnelStream error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // HTTP прокси через gRPC-Web
  async handleHttpProxy(req, res) {
    try {
      const request = req.body;
      
      console.log(`🌐 gRPC-Web HTTP Proxy: ${request.method || 'GET'} ${request.path || '/'}`);
      
      // Маскируем и обфусцируем запрос
      const maskedRequest = this.masker.maskAsJsonRPC(
        Buffer.from(JSON.stringify(request))
      );
      
      const obfuscated = this.obfuscator.obfuscate(
        JSON.stringify(maskedRequest)
      );
      
      // Отправляем через gRPC сервер
      // В реальности это был бы вызов gRPC метода
      
      // Пока заглушка
      res.json({
        jsonrpc: '2.0',
        result: {
          request_id: request.request_id,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({
            message: 'Proxy request processed',
            timestamp: Date.now()
          })).toString('base64')
        },
        id: maskedRequest.id
      });
      
    } catch (error) {
      console.error('❌ HTTP Proxy error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Регистрация через gRPC-Web
  async handleRegister(req, res) {
    try {
      const registration = req.body;
      
      console.log(`📝 gRPC-Web Registration: ${registration.client_type || 'unknown'}`);
      
      // В реальности вызываем gRPC метод
      
      res.json({
        jsonrpc: '2.0',
        result: {
          client_id: registration.client_id || `web_${Date.now()}`,
          tunnel_id: `tunnel_web_${Date.now()}`,
          server_version: '2.0.0',
          obfuscation_method: this.obfuscator.currentMethod,
          server_time: Date.now()
        },
        id: registration.id || 1
      });
      
    } catch (error) {
      console.error('❌ Registration error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Совместимость со старым API
  async handleLegacyTunnel(req, res) {
    try {
      const data = req.body;
      
      // Определяем тип запроса
      if (data.jsonrpc === '2.0') {
        // JSON-RPC запрос
        await this.handleJsonRpc(data, res);
      } else if (data.query) {
        // GraphQL запрос
        await this.handleGraphQL(data, res);
      } else {
        // Прямой туннельный запрос
        await this.handleDirectTunnel(data, res);
      }
      
    } catch (error) {
      console.error('❌ Legacy tunnel error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  async handleJsonRpc(data, res) {
    const { method, params, id } = data;
    
    console.log(`🔄 JSON-RPC: ${method}`);
    
    switch(method) {
      case 'tunnel.send':
        // Деобфусцируем данные
        const realData = JSON.parse(
          Buffer.from(params.data, 'base64').toString()
        );
        
        // Обрабатываем
        const result = await this.processTunnelData(realData);
        
        // Отправляем ответ
        res.json({
          jsonrpc: '2.0',
          result: {
            data: Buffer.from(JSON.stringify(result)).toString('base64'),
            timestamp: Date.now()
          },
          id
        });
        break;
        
      case 'tunnel.status':
        res.json({
          jsonrpc: '2.0',
          result: {
            connected_clients: this.tunnelServer ? this.tunnelServer.clients?.size || 0 : 0,
            active_tunnels: this.tunnelServer ? this.tunnelServer.tunnels?.size || 0 : 0,
            obfuscation: this.obfuscator.currentMethod,
            server_time: Date.now()
          },
          id
        });
        break;
        
      default:
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id
        });
    }
  }
  
  async handleGraphQL(data, res) {
    console.log(`🔄 GraphQL request`);
    
    // Извлекаем данные из GraphQL обертки
    const payload = Buffer.from(data.variables.input.payload, 'base64').toString();
    const tunnelData = JSON.parse(payload);
    
    const result = await this.processTunnelData(tunnelData);
    
    res.json({
      data: {
        tunnelSend: {
          success: true,
          data: Buffer.from(JSON.stringify(result)).toString('base64')
        }
      }
    });
  }
  
  async handleDirectTunnel(data, res) {
    console.log(`🎯 Direct tunnel request: ${data.type || 'unknown'}`);
    
    const result = await this.processTunnelData(data);
    
    // Обфусцируем ответ
    const obfuscated = this.obfuscator.obfuscate(
      JSON.stringify(result)
    );
    
    // Маскируем ответ
    const masked = this.masker.autoMask(
      Buffer.from(JSON.stringify(obfuscated))
    );
    
    res.json(masked.data);
  }
  
  async handleJsonTunnel(req, res) {
    const data = req.body;
    
    // Обработка JSON туннеля
    const result = await this.processTunnelData(data);
    
    res.json({
      frame_id: `frame_${Date.now()}`,
      type: 'DATA',
      payload: Buffer.from(JSON.stringify(result)).toString('base64'),
      obfuscation_method: this.obfuscator.currentMethod,
      timestamp: Date.now()
    });
  }
  
  async processTunnelData(data) {
    // Базовая обработка туннельных данных
    return {
      processed: true,
      type: data.type || 'unknown',
      timestamp: Date.now(),
      server_time: Date.now(),
      obfuscation: this.obfuscator.currentMethod
    };
  }
  
  getRouter() {
    return this.router;
  }
}
