import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class EncryptionError extends Error {
  constructor() {
    super('DECRYPTION_FAILED');
    this.name = 'EncryptionError';
  }
}

export class EncryptionService {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('ENCRYPTION_KEY_MUST_BE_32_BYTES');
  }

  encrypt(value: string, tenantId: string, recordId: string, field: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(tenantId, recordId, field));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(payload: Buffer, tenantId: string, recordId: string, field: string): string {
    try {
      if (payload.length <= 1 + IV_BYTES + TAG_BYTES || payload[0] !== VERSION) throw new Error();
      const iv = payload.subarray(1, 1 + IV_BYTES);
      const tag = payload.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
      const ciphertext = payload.subarray(1 + IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(this.aad(tenantId, recordId, field));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new EncryptionError();
    }
  }

  private aad(tenantId: string, recordId: string, field: string): Buffer {
    return Buffer.from(`v${String(VERSION)}:${tenantId}:${recordId}:${field}`, 'utf8');
  }
}
