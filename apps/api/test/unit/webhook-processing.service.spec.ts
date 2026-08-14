import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import {
  WebhookProcessingService,
  isTerminalFinancialStatus,
  type LeasedWebhookEvent,
  type WebhookProcessingStore
} from '../../src/modules/webhooks/processing/webhook-processing.service.js';

const encryption = new EncryptionService(Buffer.alloc(32, 7));
const now = new Date('2026-08-12T16:00:00.000Z');

function leased(
  eventType: LeasedWebhookEvent['eventType'] = 'PAYMENT_PIX',
  status = 'APPROVED',
  attempts = 0
): LeasedWebhookEvent {
  const id = 'event-id';
  const raw = Buffer.from(JSON.stringify({ event: eventType, id: 'gateway-id', status })).toString(
    'base64'
  );
  return {
    id,
    merchantId: 'merchant-a',
    webhookEndpointId: 'endpoint-id',
    eventType,
    rawBodyCiphertext: encryption.encrypt(raw, 'merchant-a', id, 'webhook-raw-body'),
    attempts
  };
}

function leasedFromGateway(eventType: LeasedWebhookEvent['eventType']): LeasedWebhookEvent {
  const event = leased(eventType);
  const raw = Buffer.from(
    JSON.stringify({ event: eventType, transactionId: 'gateway-id', status: 'APPROVED' })
  ).toString('base64');
  event.rawBodyCiphertext = encryption.encrypt(raw, event.merchantId, event.id, 'webhook-raw-body');
  return event;
}

function setup(event = leased()) {
  const store: jest.Mocked<WebhookProcessingStore> = {
    acquire: jest.fn().mockResolvedValue([event]),
    finish: jest.fn().mockResolvedValue(true),
    applyPayment: jest.fn().mockResolvedValue({ applied: true, currentStatus: 'APPROVED' }),
    applyWithdrawal: jest.fn().mockResolvedValue({ applied: true, currentStatus: 'APPROVED' })
  };
  return { store, service: new WebhookProcessingService(store, encryption, () => now) };
}

describe('WebhookProcessingService', () => {
  test('accepts the transactionId field sent by Lera Box', async () => {
    const { service, store } = setup(leasedFromGateway('PAYMENT_PIX'));
    await service.run();
    expect(store.applyPayment).toHaveBeenCalledWith(
      'merchant-a',
      'gateway-id',
      ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'],
      'APPROVED'
    );
  });
  test.each(['PAYMENT_PIX', 'PAYMENT_CARD'] as const)(
    'applies a %s outcome to the payment projection',
    async (eventType) => {
      const { service, store } = setup(leased(eventType));
      await expect(service.run()).resolves.toBe(1);
      expect(store.applyPayment).toHaveBeenCalledWith(
        'merchant-a',
        'gateway-id',
        ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'],
        'APPROVED'
      );
      expect(store.finish).toHaveBeenCalledWith(
        'event-id',
        'PROCESSING',
        expect.objectContaining({ status: 'PROCESSED', attempts: 1 })
      );
    }
  );

  test.each(['APPROVED', 'DENIED'] as const)(
    'applies a %s withdrawal outcome idempotently',
    async (status) => {
      const { service, store } = setup(leased('WITHDRAWAL', status));
      store.applyWithdrawal.mockResolvedValue({ applied: true, currentStatus: status });
      await service.run();
      expect(store.applyWithdrawal).toHaveBeenCalledWith(
        'merchant-a',
        'gateway-id',
        ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'],
        status
      );
    }
  );

  test.each(['APPROVED', 'DENIED'] as const)(
    'treats duplicate terminal %s outcome as processed',
    async (status) => {
      const { service, store } = setup(leased('PAYMENT_PIX', status));
      store.applyPayment.mockResolvedValue({ applied: false, currentStatus: status });
      await service.run();
      expect(store.finish).toHaveBeenCalledWith(
        'event-id',
        'PROCESSING',
        expect.objectContaining({ status: 'PROCESSED', lastErrorCode: null })
      );
    }
  );

  test.each([
    ['APPROVED', 'DENIED'],
    ['DENIED', 'APPROVED'],
    ['APPROVED', 'EXPIRED']
  ])('marks out-of-order %s after %s as reviewable', async (incoming, current) => {
    const { service, store } = setup(leased('PAYMENT_CARD', incoming));
    store.applyPayment.mockResolvedValue({ applied: false, currentStatus: current });
    await service.run();
    expect(store.finish).toHaveBeenCalledWith(
      'event-id',
      'PROCESSING',
      expect.objectContaining({
        status: 'UNPROCESSABLE',
        lastErrorCode: 'INVALID_STATE_REGRESSION'
      })
    );
  });

  test.each([
    [0, '2026-08-12T16:01:00.000Z'],
    [1, '2026-08-12T16:05:00.000Z'],
    [2, '2026-08-12T16:15:00.000Z'],
    [3, '2026-08-12T17:00:00.000Z']
  ])('schedules deterministic retry after attempt index %s', async (attempts, expected) => {
    const { service, store } = setup(leased('PAYMENT_PIX', 'APPROVED', attempts));
    store.applyPayment.mockRejectedValue(new Error('temporary'));
    await service.run();
    expect(store.finish).toHaveBeenCalledWith(
      'event-id',
      'PROCESSING',
      expect.objectContaining({
        status: 'RETRY_SCHEDULED',
        attempts: attempts + 1,
        nextAttemptAt: new Date(expected)
      })
    );
  });

  test.each([4, 5, 10])(
    'dead-letters dependency failure after retry limit at attempt %s',
    async (attempts) => {
      const { service, store } = setup(leased('PAYMENT_PIX', 'APPROVED', attempts));
      store.applyPayment.mockRejectedValue(new Error('temporary'));
      await service.run();
      expect(store.finish).toHaveBeenCalledWith(
        'event-id',
        'PROCESSING',
        expect.objectContaining({ status: 'DEAD_LETTER', nextAttemptAt: null })
      );
    }
  );

  test.each([
    ['not-json'],
    [JSON.stringify({ id: 'gateway-id', status: 'PENDING' })],
    [JSON.stringify({ status: 'APPROVED' })]
  ])('marks invalid decrypted payload as unprocessable: %#', async (decoded) => {
    const event = leased();
    event.rawBodyCiphertext = encryption.encrypt(
      Buffer.from(decoded).toString('base64'),
      'merchant-a',
      event.id,
      'webhook-raw-body'
    );
    const { service, store } = setup(event);
    await service.run();
    expect(store.finish).toHaveBeenCalledWith(
      'event-id',
      'PROCESSING',
      expect.objectContaining({ status: 'UNPROCESSABLE', lastErrorCode: 'WEBHOOK_PAYLOAD_INVALID' })
    );
    expect(store.applyPayment).not.toHaveBeenCalled();
  });

  test('uses an atomic bounded lease request and reports acquired count', async () => {
    const { service, store } = setup();
    await expect(service.run(7)).resolves.toBe(1);
    expect(store.acquire).toHaveBeenCalledWith(7, now, new Date('2026-08-12T16:01:00.000Z'));
  });

  test('does no projection work when another worker acquired the event', async () => {
    const { service, store } = setup();
    store.acquire.mockResolvedValue([]);
    await expect(service.run()).resolves.toBe(0);
    expect(store.applyPayment).not.toHaveBeenCalled();
    expect(store.finish).not.toHaveBeenCalled();
  });

  test.each(['APPROVED', 'DENIED', 'EXPIRED'])(
    'recognizes terminal financial status %s',
    (status) => {
      expect(isTerminalFinancialStatus(status)).toBe(true);
    }
  );

  test.each(['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'MANUAL_REVIEW'])(
    'does not classify unresolved %s as terminal',
    (status) => {
      expect(isTerminalFinancialStatus(status)).toBe(false);
    }
  );
});
