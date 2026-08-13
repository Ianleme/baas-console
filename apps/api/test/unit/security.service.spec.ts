import { SecurityService } from '../../src/platform/security/security.service.js';

describe('SecurityService', () => {
  const service = new SecurityService(Buffer.alloc(32, 7));

  test.each([
    ['pan', '4111111111111111'],
    ['cvv', '123'],
    ['password', 'secret'],
    ['token', 'bearer'],
    ['secret', 'secret'],
    ['authorization', 'Bearer x'],
    ['pixKey', 'key'],
    ['document', '123'],
    ['phone', '5511'],
    ['email', 'a@example.test']
  ])('redacts %s', (key, value) => {
    expect(service.redact({ [key]: value })).toEqual({ [key]: '[REDACTED]' });
  });

  test('keeps safe operational fields', () => {
    expect(service.redact({ status: 'APPROVED', amountCents: 100 })).toEqual({
      status: 'APPROVED',
      amountCents: 100
    });
  });

  test('redacts nested objects', () => {
    expect(service.redact({ payment: { card: { cvv: '123', last4: '1111' } } })).toEqual({
      payment: { card: { cvv: '[REDACTED]', last4: '1111' } }
    });
  });

  test('redacts arrays', () => {
    expect(service.redact([{ token: 'x' }, { status: 'ok' }])).toEqual([
      { token: '[REDACTED]' },
      { status: 'ok' }
    ]);
  });

  test('does not transform primitive values', () => {
    expect(service.redact('safe')).toBe('safe');
    expect(service.redact(null)).toBeNull();
  });

  test('creates deterministic blind indexes', () => {
    expect(service.blindIndex('123', 'document')).toBe(service.blindIndex('123', 'document'));
  });

  test('changes blind index with context', () => {
    expect(service.blindIndex('123', 'document')).not.toBe(service.blindIndex('123', 'phone'));
  });

  test('changes blind index with value', () => {
    expect(service.blindIndex('123', 'document')).not.toBe(service.blindIndex('124', 'document'));
  });

  test('does not return the source value in blind index', () => {
    expect(service.blindIndex('123', 'document')).not.toContain('123');
  });

  test.each(['http://localhost:5173', undefined])('allows approved origin %s', (origin) => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    expect(service.isAllowedOrigin(origin)).toBe(true);
  });

  test('rejects an unapproved origin', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.test';
    expect(service.isAllowedOrigin('https://evil.example.test')).toBe(false);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  test('allows a configured origin', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.test,https://pay.example.test';
    expect(service.isAllowedOrigin('https://pay.example.test')).toBe(true);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  test('rejects an origin with a similar prefix', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.test';
    expect(service.isAllowedOrigin('https://app.example.test.evil')).toBe(false);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  test('does not mutate input while redacting', () => {
    const input = { token: 'secret', status: 'ok' };
    service.redact(input);
    expect(input).toEqual({ token: 'secret', status: 'ok' });
  });

  test('redacts case-insensitive keys', () => {
    expect(service.redact({ CVV: '123' })).toEqual({ CVV: '[REDACTED]' });
  });

  test('redacts key variants', () => {
    expect(service.redact({ accessToken: 'x', webhookSecret: 'y' })).toEqual({
      accessToken: '[REDACTED]',
      webhookSecret: '[REDACTED]'
    });
  });

  test('retains card last four digits', () => {
    expect(service.redact({ cardLast4: '1111' })).toEqual({ cardLast4: '1111' });
  });

  test('retains status labels', () => {
    expect(service.redact({ status: 'DENIED' })).toEqual({ status: 'DENIED' });
  });

  test('retains numeric metrics', () => {
    expect(service.redact({ durationMs: 12, attempts: 2 })).toEqual({
      durationMs: 12,
      attempts: 2
    });
  });

  test('keeps null safe fields', () => {
    expect(service.redact({ targetPublicId: null })).toEqual({ targetPublicId: null });
  });

  test('keeps booleans safe fields', () => {
    expect(service.redact({ stale: false })).toEqual({ stale: false });
  });

  test('keeps deeply nested safe fields', () => {
    expect(service.redact({ operation: { outcome: 'timeout' } })).toEqual({
      operation: { outcome: 'timeout' }
    });
  });

  test('uses hexadecimal blind index output', () => {
    expect(service.blindIndex('x', 'c')).toMatch(/^[0-9a-f]{64}$/u);
  });

  test('does not treat empty origin as a trusted configured origin', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.test';
    expect(service.isAllowedOrigin('')).toBe(false);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  test('supports multiple configured origins with whitespace', () => {
    process.env.CORS_ALLOWED_ORIGINS = ' https://a.example.test , https://b.example.test ';
    expect(service.isAllowedOrigin('https://b.example.test')).toBe(true);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  test('does not allow wildcard origin configuration to match arbitrary origins', () => {
    process.env.CORS_ALLOWED_ORIGINS = '*';
    expect(service.isAllowedOrigin('https://evil.example.test')).toBe(false);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  test('redacts token values even in nested arrays', () => {
    expect(service.redact({ values: [{ refreshToken: 'x' }] })).toEqual({
      values: [{ refreshToken: '[REDACTED]' }]
    });
  });

  test('retains allowlisted public references', () => {
    expect(service.redact({ publicReference: 'ref-1' })).toEqual({ publicReference: 'ref-1' });
  });
});
