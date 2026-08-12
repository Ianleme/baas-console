import { LeraBoxTimeoutError } from '../../src/integrations/lera-box/auth/lera-box-identity.client.js';
import type { GatewayPixResult } from '../../src/integrations/lera-box/payments/lera-box-pix.client.js';
import {
  PixPaymentService,
  isValidDocument,
  type PixAttempt,
  type PixAttemptStore
} from '../../src/modules/payments/pix/pix-payment.service.js';

class MemoryPixStore implements PixAttemptStore {
  attempts: PixAttempt[] = [];
  paidLinks = new Set<string>();
  begin(
    input: Omit<
      PixAttempt,
      'status' | 'gatewayPaymentId' | 'txid' | 'emv' | 'qrCodeBase64' | 'failureCode'
    >
  ): Promise<PixAttempt> {
    if (
      this.attempts.some(
        (attempt) =>
          attempt.checkoutLinkId === input.checkoutLinkId &&
          ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'].includes(attempt.status)
      )
    )
      return Promise.reject(new Error('PAYMENT_ATTEMPT_UNRESOLVED'));
    const attempt: PixAttempt = {
      ...input,
      status: 'PROCESSING',
      gatewayPaymentId: null,
      txid: null,
      emv: null,
      qrCodeBase64: null,
      failureCode: null
    };
    this.attempts.push(attempt);
    return Promise.resolve(attempt);
  }
  transition(
    id: string,
    expected: PixAttempt['status'][],
    update: Partial<PixAttempt>
  ): Promise<PixAttempt> {
    const attempt = this.attempts.find((item) => item.id === id);
    if (!attempt) return Promise.reject(new Error('NOT_FOUND'));
    if (attempt.status === 'APPROVED' && update.status === 'APPROVED')
      return Promise.resolve(attempt);
    if (!expected.includes(attempt.status)) return Promise.reject(new Error('STATE_CONFLICT'));
    Object.assign(attempt, update);
    return Promise.resolve(attempt);
  }
  markLinkPaid(id: string): Promise<void> {
    this.paidLinks.add(id);
    return Promise.resolve();
  }
}
const approved: GatewayPixResult = {
  gatewayPaymentId: 'gateway-1',
  status: 'APPROVED',
  externalReference: 'external',
  txid: 'txid',
  emv: 'emv',
  qrCodeBase64: 'qr',
  denialReason: null
};
const denied: GatewayPixResult = {
  ...approved,
  status: 'DENIED',
  denialReason: 'DENIED_BY_GATEWAY',
  emv: null,
  qrCodeBase64: null
};
const input = {
  merchantId: 'merchant-a',
  checkoutLinkId: 'link-a',
  amountCents: '32000',
  description: 'Pedido sandbox',
  payerDocument: '529.982.247-25',
  accessToken: 'token'
};
function setup(result: GatewayPixResult | Error = approved) {
  const store = new MemoryPixStore();
  const gateway = {
    create: jest
      .fn()
      .mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      )
  };
  let id = 0;
  const service = new PixPaymentService(gateway, store, () => `id-${String(++id)}`);
  return { store, gateway, service };
}

describe('PixPaymentService', () => {
  test('creates exactly one gateway Pix with normalized data', async () => {
    const { service, gateway } = setup();
    await service.start(input);
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(gateway.create).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        amountCents: '32000',
        payerDocument: '52998224725',
        description: 'Pedido sandbox',
        externalReference: 'PIX-link-a-id-2'
      })
    );
  });
  test('creates the local attempt before the remote call', async () => {
    const store = new MemoryPixStore();
    const gateway = {
      create: jest.fn(() => {
        expect(store.attempts[0]?.status).toBe('PROCESSING');
        return Promise.resolve(approved);
      })
    };
    await new PixPaymentService(gateway, store, () => 'id').start(input);
  });
  test('returns 201 and atomically approves attempt/link', async () => {
    const { service, store } = setup();
    const result = await service.start(input);
    expect(result.httpStatus).toBe(201);
    expect(result.attempt.status).toBe('APPROVED');
    expect(store.paidLinks.has('link-a')).toBe(true);
  });
  test('persists QR, EMV and txid allowlist fields', async () => {
    const { service } = setup();
    await expect(service.start(input)).resolves.toMatchObject({
      attempt: { txid: 'txid', emv: 'emv', qrCodeBase64: 'qr' }
    });
  });
  test('definitive denial closes only the attempt', async () => {
    const { service, store } = setup(denied);
    const result = await service.start(input);
    expect(result.attempt.status).toBe('DENIED');
    expect(store.paidLinks.size).toBe(0);
  });
  test('denial permits a new attempt for the same active link', async () => {
    const { service, store } = setup(denied);
    await service.start(input);
    await expect(service.start(input)).resolves.toHaveProperty('attempt.status', 'DENIED');
    expect(store.attempts).toHaveLength(2);
  });
  test('timeout becomes reconciliation pending and returns 202', async () => {
    const { service } = setup(new LeraBoxTimeoutError('create-pix'));
    await expect(service.start(input)).resolves.toMatchObject({
      httpStatus: 202,
      attempt: { status: 'RECONCILIATION_PENDING' }
    });
  });
  test('timeout performs only one remote POST', async () => {
    const { service, gateway } = setup(new LeraBoxTimeoutError('create-pix'));
    await service.start(input);
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });
  test('reconciliation pending blocks a repeated Pix', async () => {
    const { service } = setup(new LeraBoxTimeoutError('create-pix'));
    await service.start(input);
    await expect(service.start(input)).rejects.toThrow('PAYMENT_ATTEMPT_UNRESOLVED');
  });
  test('late approval overrides reconciliation pending', async () => {
    const { service, store } = setup(new LeraBoxTimeoutError('create-pix'));
    const pending = await service.start(input);
    const late = await service.applyLateOutcome(pending.attempt.id, approved);
    expect(late.status).toBe('APPROVED');
    expect(store.paidLinks.has('link-a')).toBe(true);
  });
  test('duplicate late approval is idempotent', async () => {
    const { service, store } = setup(new LeraBoxTimeoutError('create-pix'));
    const pending = await service.start(input);
    await service.applyLateOutcome(pending.attempt.id, approved);
    await service.applyLateOutcome(pending.attempt.id, approved);
    expect(store.paidLinks.size).toBe(1);
  });
  test.each(['0', '-1', '12.5', 'abc'])(
    'rejects invalid cents %s before POST',
    async (amountCents) => {
      const { service, gateway } = setup();
      await expect(service.start({ ...input, amountCents })).rejects.toMatchObject({
        code: 'AMOUNT_INVALID'
      });
      expect(gateway.create).not.toHaveBeenCalled();
    }
  );
  test.each(['', '11111111111', '12345678900'])(
    'rejects invalid payer document %s',
    async (payerDocument) => {
      const { service } = setup();
      await expect(service.start({ ...input, payerDocument })).rejects.toMatchObject({
        code: 'PAYER_DOCUMENT_INVALID'
      });
    }
  );
  test('rejects an empty description', async () => {
    const { service } = setup();
    await expect(service.start({ ...input, description: ' ' })).rejects.toMatchObject({
      code: 'DESCRIPTION_INVALID'
    });
  });
  test('validates known CPF and CNPJ check digits', () => {
    expect(isValidDocument('52998224725')).toBe(true);
    expect(isValidDocument('04252011000110')).toBe(true);
  });
});
