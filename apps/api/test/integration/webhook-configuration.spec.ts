import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import {
  WebhookConfigurationError,
  WebhookConfigurationService,
  type WebhookConfigurationAudit,
  type WebhookConfigurationRecord,
  type WebhookConfigurationStore
} from '../../src/modules/webhooks/configuration/webhook-configuration.service.js';

class MemoryStore implements WebhookConfigurationStore {
  records: WebhookConfigurationRecord[] = [];
  audits: WebhookConfigurationAudit[] = [];
  conflict = false;
  find(merchantId: string, event: WebhookConfigurationRecord['eventType']) {
    return Promise.resolve(
      this.records.find((record) => record.merchantId === merchantId && record.eventType === event)
    );
  }
  list(merchantId: string) {
    return Promise.resolve(this.records.filter((record) => record.merchantId === merchantId));
  }
  replace(record: WebhookConfigurationRecord, audit: WebhookConfigurationAudit) {
    this.records = this.records.filter(
      (item) => item.merchantId !== record.merchantId || item.eventType !== record.eventType
    );
    this.records.push(record);
    this.audits.push(audit);
    return Promise.resolve();
  }
  remove(
    merchantId: string,
    event: WebhookConfigurationRecord['eventType'],
    audit: WebhookConfigurationAudit
  ) {
    if (this.conflict) return Promise.resolve(false);
    const before = this.records.length;
    this.records = this.records.filter(
      (record) => record.merchantId !== merchantId || record.eventType !== event
    );
    if (this.records.length !== before) this.audits.push(audit);
    return Promise.resolve(this.records.length !== before);
  }
}

const now = new Date('2026-08-12T12:00:00.000Z');

interface GatewayCreateInput {
  event: 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL';
  url: string;
  secret: string;
}

function setup() {
  const store = new MemoryStore();
  let sequence = 0;
  const gateway = {
    create: jest
      .fn<
        Promise<{
          id: string;
          event: GatewayCreateInput['event'];
          url: string;
          active: boolean;
          createdAt: string;
          updatedAt: string;
        }>,
        [string, GatewayCreateInput]
      >()
      .mockImplementation((_accessToken, input) =>
        Promise.resolve({
          id: `gateway-${input.event}`,
          event: input.event,
          url: input.url,
          active: true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        })
      ),
    delete: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined)
  };
  const service = new WebhookConfigurationService(
    gateway,
    store,
    new EncryptionService(Buffer.alloc(32, 7)),
    'https://api.example.test',
    () => now,
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    () => `opaque-${String(sequence).padStart(24, '0')}`,
    () => `secret-${String(sequence).padStart(32, '0')}`
  );
  return { gateway, service, store };
}

const input = {
  merchantId: 'merchant-a',
  actorUserId: 'user-a',
  requestId: 'request-a',
  accessToken: 'gateway-token',
  event: 'PAYMENT_PIX' as const
};

describe('WebhookConfigurationService integration boundary', () => {
  test('rejects a public callback base URL that is not an HTTPS origin', () => {
    const store = new MemoryStore();
    expect(
      () =>
        new WebhookConfigurationService(
          { create: jest.fn(), delete: jest.fn() },
          store,
          new EncryptionService(Buffer.alloc(32, 7)),
          'http://localhost:3000'
        )
    ).toThrow('PUBLIC_API_BASE_URL_INVALID');
  });

  test.each(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'] as const)(
    'configures the mandatory %s event',
    async (event) => {
      const { service } = setup();
      await expect(service.configure({ ...input, event })).resolves.toMatchObject({
        event,
        status: 'ACTIVE',
        configuredAt: now
      });
    }
  );

  test('uses an opaque callback URL without tenant identity', async () => {
    const { gateway, service } = setup();
    await service.configure(input);
    const request = gateway.create.mock.calls[0]?.[1];
    if (!request) throw new Error('GATEWAY_REQUEST_MISSING');
    expect(request.url).toMatch(/^https:\/\/api\.example\.test\/api\/v1\/webhooks\/opaque-/u);
    expect(request.url).not.toContain(input.merchantId);
  });

  test('generates and encrypts its own callback secret', async () => {
    const { gateway, service, store } = setup();
    await service.configure(input);
    const request = gateway.create.mock.calls[0]?.[1];
    if (!request) throw new Error('GATEWAY_REQUEST_MISSING');
    const record = store.records[0];
    expect(record?.secretCiphertext.toString('utf8')).not.toContain(request.secret);
    expect(record?.secretCiphertext.equals(Buffer.from(request.secret))).toBe(false);
  });

  test('never exposes the secret or endpoint identifier in list views', async () => {
    const { service } = setup();
    await service.configure(input);
    const serialized = JSON.stringify(await service.list(input.merchantId));
    expect(serialized).not.toContain('secret-');
    expect(serialized).not.toContain('opaque-');
    expect(serialized).not.toContain('gateway-');
  });

  test('isolates list results by merchant', async () => {
    const { service } = setup();
    await service.configure(input);
    expect(await service.list('merchant-b')).toEqual([]);
  });

  test('records allowlisted configuration audit metadata', async () => {
    const { service, store } = setup();
    await service.configure(input);
    expect(store.audits[0]).toMatchObject({
      merchantId: 'merchant-a',
      actorUserId: 'user-a',
      action: 'WEBHOOK_CONFIGURED',
      requestId: 'request-a',
      metadata: { event: 'PAYMENT_PIX' }
    });
    expect(JSON.stringify(store.audits[0])).not.toContain('gateway-token');
  });

  test('reconfiguration deletes the old remote callback and audits the replacement', async () => {
    const { gateway, service, store } = setup();
    await service.configure(input);
    await service.configure(input);
    expect(gateway.delete).toHaveBeenCalledWith('gateway-token', 'gateway-PAYMENT_PIX');
    expect(store.audits.at(-1)?.action).toBe('WEBHOOK_RECONFIGURED');
    expect(store.records).toHaveLength(1);
  });

  test('keeps the old callback when creating its replacement fails', async () => {
    const { gateway, service, store } = setup();
    await service.configure(input);
    const previous = store.records[0];
    gateway.create.mockRejectedValueOnce(new Error('GATEWAY_UNAVAILABLE'));

    await expect(service.configure(input)).rejects.toThrow('GATEWAY_UNAVAILABLE');

    expect(gateway.delete).not.toHaveBeenCalled();
    expect(store.records).toEqual([previous]);
    expect(store.audits).toHaveLength(1);
  });

  test('removes only the tenant-owned callback and records an audit event', async () => {
    const { service, store } = setup();
    await service.configure(input);
    await service.configure({ ...input, merchantId: 'merchant-b', actorUserId: 'user-b' });
    await service.remove(input);
    expect(await service.list('merchant-a')).toEqual([]);
    expect(await service.list('merchant-b')).toHaveLength(1);
    expect(store.audits.at(-1)?.action).toBe('WEBHOOK_REMOVED');
  });

  test('hides a missing or cross-tenant callback as not found', async () => {
    const { service } = setup();
    await service.configure(input);
    await expect(service.remove({ ...input, merchantId: 'merchant-b' })).rejects.toMatchObject({
      code: 'WEBHOOK_NOT_FOUND'
    });
  });

  test('reports a concurrent removal instead of claiming success', async () => {
    const { service, store } = setup();
    await service.configure(input);
    store.conflict = true;
    await expect(service.remove(input)).rejects.toMatchObject({
      code: 'WEBHOOK_STATE_CONFLICT'
    });
  });

  test('rejects unsupported event names before calling the gateway', async () => {
    const { gateway, service } = setup();
    await expect(
      service.configure({ ...input, event: 'UNSUPPORTED' as 'PAYMENT_PIX' })
    ).rejects.toBeInstanceOf(WebhookConfigurationError);
    expect(gateway.create).not.toHaveBeenCalled();
  });
});
