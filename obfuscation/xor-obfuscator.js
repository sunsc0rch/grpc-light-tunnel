import crypto from 'crypto';

export class XORObfuscator {
  constructor(key) {
    this.key = key || process.env.OBFUSCATION_KEY || 'default-32-byte-key-for-xor-obfuscation!';
    this.keyBuffer = Buffer.from(this.key);
  }
  
  obfuscate(data) {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const result = Buffer.alloc(dataBuffer.length);
    
    for (let i = 0; i < dataBuffer.length; i++) {
      result[i] = dataBuffer[i] ^ this.keyBuffer[i % this.keyBuffer.length];
    }
    
    return {
      method: 'xor',
      data: result.toString('base64'),
      key_hash: crypto.createHash('sha256').update(this.key).digest('hex').slice(0, 8)
    };
  }
  
  deobfuscate(obfuscated) {
    if (obfuscated.method !== 'xor') {
      throw new Error('Invalid obfuscation method');
    }
    
    const dataBuffer = Buffer.from(obfuscated.data, 'base64');
    const result = Buffer.alloc(dataBuffer.length);
    
    for (let i = 0; i < dataBuffer.length; i++) {
      result[i] = dataBuffer[i] ^ this.keyBuffer[i % this.keyBuffer.length];
    }
    
    return result;
  }
}
