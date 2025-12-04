import { XORObfuscator } from './xor-obfuscator.js';
import { AESObfuscator } from './aes-obfuscator.js';

export class ObfuscationRotator {
  constructor() {
    this.methods = ['xor', 'aes', 'base64'];
    this.currentMethod = 'xor';
    this.obfuscators = {
      'xor': new XORObfuscator(),
      'aes': new AESObfuscator(),
      'base64': new Base64Obfuscator()
    };
    
    // Ротация каждые 5 минут
    setInterval(() => this.rotate(), 5 * 60 * 1000);
  }
  
  obfuscate(data, method = this.currentMethod) {
    if (!this.obfuscators[method]) {
      method = 'base64'; // fallback
    }
    
    const obfuscated = this.obfuscators[method].obfuscate(data);
    obfuscated.method = method;
    obfuscated.timestamp = Date.now();
    
    return obfuscated;
  }
  
  deobfuscate(obfuscated) {
    const method = obfuscated.method;
    
    if (!this.obfuscators[method]) {
      throw new Error(`Unknown obfuscation method: ${method}`);
    }
    
    return this.obfuscators[method].deobfuscate(obfuscated);
  }
  
  rotate() {
    const currentIndex = this.methods.indexOf(this.currentMethod);
    this.currentMethod = this.methods[(currentIndex + 1) % this.methods.length];
    
    console.log(`🔄 Rotated obfuscation to: ${this.currentMethod}`);
    
    // Уведомляем клиентов о смене метода
    this.notifyClients();
    
    return this.currentMethod;
  }
  
  notifyClients() {
    // В реальной реализации отправляем уведомление подключенным клиентам
  }
}

class Base64Obfuscator {
  obfuscate(data) {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return {
      method: 'base64',
      data: dataBuffer.toString('base64')
    };
  }
  
  deobfuscate(obfuscated) {
    return Buffer.from(obfuscated.data, 'base64');
  }
}
