import {
  LeraBoxDependencyError,
  LeraBoxTimeoutError
} from '../../src/integrations/lera-box/auth/lera-box-identity.client.js';
import type { GatewayCardResult } from '../../src/integrations/lera-box/payments/lera-box-card.client.js';
import type { EmailOutboxService } from '../../src/modules/notifications/email-outbox.service.js';
import {
  CardPaymentService,
  type CardAttempt,
  type CardAttemptStore
} from '../../src/modules/payments/card/card-payment.service.js';

class MemoryCardStore implements CardAttemptStore {
  attempts: CardAttempt[] = [];
  denialCount = 0;
  paid = new Set<string>();
  countRecentDenials(): Promise<number> {
    return Promise.resolve(this.denialCount);
  }
  begin(input: Omit<CardAttempt, 'status' | 'gatewayPaymentId' | 'failureCode'>) {
    if (
      this.attempts.some((attempt) =>
        ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'].includes(attempt.status)
      )
    )
      return Promise.reject(new Error('PAYMENT_ATTEMPT_UNRESOLVED'));
    const attempt: CardAttempt = {
      ...input,
      status: 'PROCESSING',
      gatewayPaymentId: null,
      failureCode: null
    };
    this.attempts.push(attempt);
    return Promise.resolve(attempt);
  }
  transition(id: string, expected: CardAttempt['status'][], update: Partial<CardAttempt>) {
    const attempt = this.attempts.find((item) => item.id === id);
    if (!attempt || !expected.includes(attempt.status))
      return Promise.reject(new Error('STATE_CONFLICT'));
    Object.assign(attempt, update);
    return Promise.resolve(attempt);
  }
  markLinkPaid(id: string) {
    this.paid.add(id);
    return Promise.resolve();
  }
}
const fee = { id: 'fee', brand: 'VISA' as const, installments: 3, feeBps: 319 };
const approved: GatewayCardResult = {
  gatewayPaymentId: 'gateway-card',
  status: 'APPROVED',
  externalReference: 'ref',
  brand: 'VISA',
  last4: '1111',
  installments: 3,
  feeBps: 319,
  feeAmountCents: '1021',
  netAmountCents: '30979',
  denialReason: null
};
const card = {
  number: '4111 1111 1111 1111',
  holder: 'CLIENTE SANDBOX',
  expiryMonth: 12,
  expiryYear: 2030,
  cvv: '123'
};
function setup(result: GatewayCardResult | Error = approved) {
  const store = new MemoryCardStore();
  const fees = { list: jest.fn().mockResolvedValue([fee]) };
  const gateway = {
    create: jest
      .fn()
      .mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      )
  };
  let sequence = 0;
  const service = new CardPaymentService(
    fees,
    gateway,
    store,
    () => `id-${String(++sequence)}`,
    () => new Date('2026-08-12T00:00:00Z')
  );
  return { service, store, fees, gateway };
}
async function quoted(service: CardPaymentService) {
  return service.quote('32000', 'VISA', 3);
}
async function confirmInput(service: CardPaymentService) {
  return {
    merchantId: 'merchant',
    checkoutLinkId: 'link',
    accessToken: 'token',
    description: 'Pedido sandbox',
    quote: await quoted(service),
    card
  };
}

describe('CardPaymentService', () => {
  test('quotes gross fee and net in integer cents', async () => {
    const { service } = setup();
    await expect(quoted(service)).resolves.toMatchObject({
      grossAmountCents: '32000',
      feeAmountCents: '1021',
      netAmountCents: '30979'
    });
  });
  test('rounds fee half up in cents', async () => {
    const { service } = setup();
    await expect(service.quote('100', 'VISA', 3)).resolves.toHaveProperty('feeAmountCents', '3');
  });
  test('snapshots brand installments and bps', async () => {
    const { service } = setup();
    await expect(quoted(service)).resolves.toMatchObject({
      brand: 'VISA',
      installments: 3,
      feeBps: 319
    });
  });
  test('requests fees by brand', async () => {
    const { service, fees } = setup();
    await quoted(service);
    expect(fees.list).toHaveBeenCalledWith('VISA');
  });
  test.each(['0', '-1', '1.5', 'x'])('rejects invalid quote amount %s', async (amount) => {
    const { service } = setup();
    await expect(service.quote(amount, 'VISA', 3)).rejects.toMatchObject({
      code: 'AMOUNT_INVALID'
    });
  });
  test.each([0, 22, 1.5])('rejects installments %s', async (installments) => {
    const { service } = setup();
    await expect(service.quote('100', 'VISA', installments)).rejects.toMatchObject({
      code: 'INSTALLMENTS_INVALID'
    });
  });
  test('rejects absent fee', async () => {
    const { service, fees } = setup();
    fees.list.mockResolvedValue([]);
    await expect(quoted(service)).rejects.toMatchObject({ code: 'FEE_NOT_FOUND' });
  });
  test('revalidates fee before POST', async () => {
    const { service, fees, gateway } = setup();
    const input = await confirmInput(service);
    fees.list.mockResolvedValue([{ ...fee, feeBps: 400 }]);
    await expect(service.confirm(input)).rejects.toMatchObject({ code: 'FEE_CHANGED' });
    expect(gateway.create).not.toHaveBeenCalled();
  });
  test('changed fee does not create local attempt', async () => {
    const { service, fees, store } = setup();
    const input = await confirmInput(service);
    fees.list.mockResolvedValue([{ ...fee, feeBps: 400 }]);
    await expect(service.confirm(input)).rejects.toThrow('FEE_CHANGED');
    expect(store.attempts).toHaveLength(0);
  });
  test('creates exactly one card POST with exact quote', async () => {
    const { service, gateway } = setup();
    await service.confirm(await confirmInput(service));
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(gateway.create).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        amountCents: '32000',
        installments: 3,
        feeBps: 319,
        externalReference: 'CARD-id-2'
      })
    );
  });
  test('normalizes transient card fields only at adapter call', async () => {
    const { service, gateway } = setup();
    await service.confirm(await confirmInput(service));
    expect(gateway.create).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        cardNumber: '4111111111111111',
        cardHolder: 'CLIENTE SANDBOX',
        cvv: '123'
      })
    );
  });
  test('persists only brand and last four card digits', async () => {
    const { service, store } = setup();
    await service.confirm(await confirmInput(service));
    expect(store.attempts[0]).toMatchObject({ cardBrand: 'VISA', cardLast4: '1111' });
    expect(JSON.stringify(store.attempts)).not.toMatch(/4111111111111111|CLIENTE SANDBOX|"123"/u);
  });
  test('approves attempt and link', async () => {
    const { service, store } = setup();
    const result = await service.confirm(await confirmInput(service));
    expect(result).toMatchObject({ httpStatus: 201, attempt: { status: 'APPROVED' } });
    expect(store.paid.has('link')).toBe(true);
  });
  test('denial closes attempt without paying link', async () => {
    const { service, store } = setup({ ...approved, status: 'DENIED', denialReason: 'DECLINED' });
    const result = await service.confirm(await confirmInput(service));
    expect(result.attempt).toMatchObject({ status: 'DENIED', failureCode: 'DECLINED' });
    expect(store.paid.size).toBe(0);
  });
  test('timeout returns 202 reconciliation pending after one POST', async () => {
    const { service, gateway } = setup(new LeraBoxTimeoutError('create-card'));
    const result = await service.confirm(await confirmInput(service));
    expect(result).toMatchObject({
      httpStatus: 202,
      attempt: { status: 'RECONCILIATION_PENDING' }
    });
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });
  test('conclusive gateway rejection closes the local attempt', async () => {
    const { service, store } = setup(
      new LeraBoxDependencyError('create-card', 'LERA_BOX_CONCLUSIVE_FAILURE', 400)
    );
    await expect(service.confirm(await confirmInput(service))).rejects.toMatchObject({
      remoteStatus: 400
    });
    expect(store.attempts[0]).toMatchObject({
      status: 'DENIED',
      failureCode: 'LERA_BOX_CONCLUSIVE_FAILURE'
    });
  });
  test('an unresolved card blocks another attempt', async () => {
    const { service } = setup(new LeraBoxTimeoutError('create-card'));
    const input = await confirmInput(service);
    await service.confirm(input);
    await expect(service.confirm(input)).rejects.toThrow('PAYMENT_ATTEMPT_UNRESOLVED');
  });
  test('five recent denials enforce cooldown before POST', async () => {
    const { service, store, gateway } = setup();
    store.denialCount = 5;
    await expect(service.confirm(await confirmInput(service))).rejects.toMatchObject({
      code: 'CARD_COOLDOWN'
    });
    expect(gateway.create).not.toHaveBeenCalled();
  });
  test('four recent denials still allow one attempt', async () => {
    const { service, store, gateway } = setup();
    store.denialCount = 4;
    await service.confirm(await confirmInput(service));
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });
  test.each([
    [{ ...card, number: '4111111111111112' }, 'number'],
    [{ ...card, cvv: '12' }, 'cvv'],
    [{ ...card, holder: ' ' }, 'holder'],
    [{ ...card, expiryMonth: 13 }, 'month'],
    [{ ...card, expiryYear: 2025 }, 'expiry']
  ])('rejects invalid transient card %s', async (invalid) => {
    const { service, gateway } = setup();
    const input = await confirmInput(service);
    await expect(service.confirm({ ...input, card: invalid as typeof card })).rejects.toMatchObject(
      { code: 'CARD_INVALID', message: 'CARD_INVALID' }
    );
    expect(gateway.create).not.toHaveBeenCalled();
  });
  test('errors never contain transient card values', async () => {
    const { service } = setup();
    const input = await confirmInput(service);
    await expect(service.confirm({ ...input, card: { ...card, cvv: '1' } })).rejects.not.toThrow(
      /4111|CLIENTE|123/u
    );
  });
  test.each(['', ' '.repeat(2), 'x'.repeat(256)])(
    'rejects unsafe description without POST',
    async (description) => {
      const { service, gateway } = setup();
      const input = await confirmInput(service);
      await expect(service.confirm({ ...input, description })).rejects.toMatchObject({
        code: 'DESCRIPTION_INVALID'
      });
      expect(gateway.create).not.toHaveBeenCalled();
    }
  );
  test('queues payment receipt e-mail when Card payment is approved', async () => {
    const store = new MemoryCardStore();
    const fees = { list: jest.fn().mockResolvedValue([fee]) };
    const gateway = { create: jest.fn().mockResolvedValue(approved) };
    const mockOutbox = { enqueue: jest.fn().mockResolvedValue({ id: 'del-card' }) };
    const service = new CardPaymentService(
      fees,
      gateway,
      store,
      () => 'id',
      () => new Date('2026-08-12T00:00:00Z'),
      mockOutbox as unknown as EmailOutboxService
    );
    const input = await confirmInput(service);
    await service.confirm({ ...input, payerEmail: 'comprador@loja.com' });
    expect(mockOutbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'merchant',
        kind: 'PAYMENT_RECEIPT',
        idempotencyKey: 'receipt:card:id',
        recipient: 'comprador@loja.com'
      })
    );
  });
  test('does not send a receipt to a placeholder address without a payer e-mail', async () => {
    const store = new MemoryCardStore();
    const fees = { list: jest.fn().mockResolvedValue([fee]) };
    const gateway = { create: jest.fn().mockResolvedValue(approved) };
    const mockOutbox = { enqueue: jest.fn() };
    const service = new CardPaymentService(
      fees,
      gateway,
      store,
      () => 'id',
      () => new Date('2026-08-12T00:00:00Z'),
      mockOutbox as unknown as EmailOutboxService
    );
    await service.confirm(await confirmInput(service));
    expect(mockOutbox.enqueue).not.toHaveBeenCalled();
  });
});
