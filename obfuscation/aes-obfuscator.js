import crypto from 'crypto';

export class AESObfuscator {
  constructor(key) {
    this.key = key || process.env.AES_KEY || crypto.randomBytes(32).toString('hex');
    this.algorithm = 'aes-256-gcm';
  }
  
  obfuscate(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.key, 'hex'), iv);
    
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    let encrypted = cipher.update(dataBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return {
      method: 'aes-256-gcm',
      data: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64')
    };
  }
  
  deobfuscate(obfuscated) {
    if (obfuscated.method !== 'aes-256-gcm') {
      throw new Error('Invalid obfuscation method');
    }
    
    const iv = Buffer.from(obfuscated.iv, 'base64');
    const authTag = Buffer.from(obfuscated.auth_tag, 'base64');
    const encrypted = Buffer.from(obfuscated.data, 'base64');
    
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(this.key, 'hex'),
      iv
    );
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }
}
