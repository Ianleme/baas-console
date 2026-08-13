import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

const SECRET_KEYS = /(?:pan|cvv|password|token|secret|authorization|pixkey|document|phone|email)/iu;

@Injectable()
export class SecurityService {
  constructor(private readonly blindIndexKey: Buffer) {}

  redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_KEYS.test(key) ? '[REDACTED]' : this.redact(child)
      ])
    );
  }

  blindIndex(value: string, context: string): string {
    return createHmac('sha256', this.blindIndexKey)
      .update(`${context}:`)
      .update(value)
      .digest('hex');
  }

  isAllowedOrigin(origin: string | undefined): boolean {
    if (origin === undefined) return true;
    const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return allowed.includes(origin);
  }
}
