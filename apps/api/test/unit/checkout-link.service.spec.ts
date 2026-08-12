import {
  CheckoutLinkError,
  CheckoutLinkService,
  createSha256TokenProtector,
  isUnresolvedAttemptStatus,
  type CheckoutLinkRecord,
  type CheckoutLinkStore
} from '../../src/modules/checkout-links/checkout-link.service.js';

class MemoryLinkStore implements CheckoutLinkStore {
  links: CheckoutLinkRecord[] = [];
  unresolved = false;
  stateConflict = false;

  create(link: CheckoutLinkRecord): Promise<void> {
    if (
      this.links.some(
        (item) =>
          item.publicTokenHash.equals(link.publicTokenHash) ||
          (item.merchantId === link.merchantId && item.publicReference === link.publicReference)
      )
    )
      return Promise.reject(new CheckoutLinkError('LINK_UNIQUE_CONFLICT'));
    this.links.push(link);
    return Promise.resolve();
  }
  list(merchantId: string): Promise<CheckoutLinkRecord[]> {
    return Promise.resolve(this.links.filter((link) => link.merchantId === merchantId));
  }
  find(merchantId: string, id: string): Promise<CheckoutLinkRecord | undefined> {
    return Promise.resolve(
      this.links.find((link) => link.merchantId === merchantId && link.id === id)
    );
  }
  setStatus(
    merchantId: string,
    id: string,
    expected: CheckoutLinkRecord['status'],
    next: CheckoutLinkRecord['status'],
    tokenClosedAt: Date | null
  ): Promise<boolean> {
    const link = this.links.find((item) => item.merchantId === merchantId && item.id === id);
    if (this.stateConflict || link?.status !== expected) return Promise.resolve(false);
    link.status = next;
    link.tokenClosedAt = tokenClosedAt;
    return Promise.resolve(true);
  }
  hasUnresolvedAttempt(): Promise<boolean> {
    return Promise.resolve(this.unresolved);
  }
}

const now = new Date('2026-08-12T12:00:00.000Z');
const input = {
  publicReference: 'REF-001',
  description: 'Consultoria mensal',
  amountCents: '125000',
  allowedMethods: 'PIX_CARD' as const,
  maxInstallments: 3,
  expiresAt: new Date('2026-08-13T12:00:00.000Z')
};
const gatewayFees = [
  { id: 'fee-1', brand: 'VISA' as const, installments: 1, feeBps: 199 },
  { id: 'fee-3', brand: 'VISA' as const, installments: 3, feeBps: 299 },
  { id: 'fee-21', brand: 'VISA' as const, installments: 21, feeBps: 699 }
];

function setup() {
  const store = new MemoryLinkStore();
  const fees = { list: jest.fn().mockResolvedValue(gatewayFees) };
  const service = new CheckoutLinkService(
    store,
    fees,
    createSha256TokenProtector((token) => Buffer.from(`sealed:${token}`)),
    () => now,
    () => `id-${String(store.links.length + 1)}`,
    () => Buffer.alloc(32, store.links.length + 1).toString('base64url')
  );
  return { store, fees, service };
}

describe('CheckoutLinkService', () => {
  test('creates an active immutable-value record', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    expect(created.link).toMatchObject({
      merchantId: 'merchant-a',
      status: 'ACTIVE',
      amountCents: '125000',
      allowedMethods: 'PIX_CARD',
      maxInstallments: 3
    });
  });
  test('returns a token with at least 256 bits', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    expect(Buffer.from(created.publicToken, 'base64url')).toHaveLength(32);
  });
  test('persists only a token hash and protected ciphertext', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    expect(created.link.publicTokenHash.toString('utf8')).not.toContain(created.publicToken);
    expect(created.link.publicTokenCiphertext.toString('utf8')).toBe(
      `sealed:${created.publicToken}`
    );
  });
  test('consults and snapshots gateway fees for card links', async () => {
    const { service, fees } = setup();
    const created = await service.create('merchant-a', input);
    expect(fees.list).toHaveBeenCalledTimes(1);
    expect(created.link.feeSnapshot).toEqual(gatewayFees.slice(0, 2));
  });
  test('does not consult fees for Pix-only links', async () => {
    const { service, fees } = setup();
    const created = await service.create('merchant-a', {
      ...input,
      allowedMethods: 'PIX',
      maxInstallments: 1
    });
    expect(fees.list).not.toHaveBeenCalled();
    expect(created.link.feeSnapshot).toEqual([]);
  });
  test('supports the gateway maximum of 21 installments', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', { ...input, maxInstallments: 21 });
    expect(created.link.feeSnapshot.at(-1)?.installments).toBe(21);
  });
  test.each([
    ['', 'DESCRIPTION_INVALID'],
    ['x'.repeat(256), 'DESCRIPTION_INVALID']
  ])('rejects invalid description %#', async (description, code) => {
    const { service } = setup();
    await expect(service.create('merchant-a', { ...input, description })).rejects.toMatchObject({
      code
    });
  });
  test.each([
    ['', 'REFERENCE_INVALID'],
    ['x'.repeat(101), 'REFERENCE_INVALID']
  ])('rejects invalid reference %#', async (publicReference, code) => {
    const { service } = setup();
    await expect(service.create('merchant-a', { ...input, publicReference })).rejects.toMatchObject(
      { code }
    );
  });
  test.each(['0', '-1', '12.50', 'abc', '18446744073709551616'])(
    'rejects non-positive, non-integer or out-of-range cents: %s',
    async (amountCents) => {
      const { service } = setup();
      await expect(service.create('merchant-a', { ...input, amountCents })).rejects.toMatchObject({
        code: 'AMOUNT_INVALID'
      });
    }
  );
  test('rejects unsupported methods', async () => {
    const { service } = setup();
    await expect(
      service.create('merchant-a', { ...input, allowedMethods: 'CASH' as 'CARD' })
    ).rejects.toMatchObject({ code: 'METHOD_INVALID' });
  });
  test.each([0, 22, 1.5])('rejects invalid card installment count: %s', async (maxInstallments) => {
    const { service } = setup();
    await expect(service.create('merchant-a', { ...input, maxInstallments })).rejects.toMatchObject(
      {
        code: 'INSTALLMENTS_INVALID'
      }
    );
  });
  test('rejects Pix with more than one installment', async () => {
    const { service } = setup();
    await expect(
      service.create('merchant-a', { ...input, allowedMethods: 'PIX', maxInstallments: 2 })
    ).rejects.toMatchObject({ code: 'INSTALLMENTS_INVALID' });
  });
  test('rejects an expiry at the current instant', async () => {
    const { service } = setup();
    await expect(service.create('merchant-a', { ...input, expiresAt: now })).rejects.toMatchObject({
      code: 'EXPIRY_INVALID'
    });
  });
  test('enforces reference uniqueness per merchant', async () => {
    const { service } = setup();
    await service.create('merchant-a', input);
    await expect(service.create('merchant-a', input)).rejects.toMatchObject({
      code: 'LINK_UNIQUE_CONFLICT'
    });
  });
  test('isolates list results by merchant', async () => {
    const { service } = setup();
    await service.create('merchant-a', input);
    expect(await service.list('merchant-b')).toEqual([]);
  });
  test('hides cross-tenant details as not found', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    await expect(service.detail('merchant-b', created.link.id)).rejects.toMatchObject({
      code: 'LINK_NOT_FOUND'
    });
  });
  test('expires an active link lazily after its deadline', async () => {
    const { service, store } = setup();
    const created = await service.create('merchant-a', input);
    created.link.expiresAt = new Date('2026-08-11T12:00:00.000Z');
    expect((await service.detail('merchant-a', created.link.id)).status).toBe('EXPIRED');
    expect(store.links[0]?.tokenClosedAt).toEqual(now);
  });
  test('cancels an active link exactly once', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    expect((await service.cancel('merchant-a', created.link.id)).status).toBe('CANCELLED');
    await expect(service.cancel('merchant-a', created.link.id)).rejects.toMatchObject({
      code: 'LINK_NOT_ACTIVE'
    });
  });
  test('blocks cancellation while an attempt is unresolved', async () => {
    const { service, store } = setup();
    const created = await service.create('merchant-a', input);
    store.unresolved = true;
    await expect(service.cancel('merchant-a', created.link.id)).rejects.toMatchObject({
      code: 'PAYMENT_ATTEMPT_UNRESOLVED'
    });
  });
  test('blocks a second financial attempt while one is unresolved', async () => {
    const { service, store } = setup();
    const created = await service.create('merchant-a', input);
    store.unresolved = true;
    await expect(
      service.assertCanStartAttempt('merchant-a', created.link.id)
    ).rejects.toMatchObject({
      code: 'PAYMENT_ATTEMPT_UNRESOLVED'
    });
  });
  test('approval atomically closes the link', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    const link = await service.applyAttemptOutcome('merchant-a', created.link.id, 'APPROVED');
    expect(link).toMatchObject({ status: 'PAID', tokenClosedAt: now });
  });
  test('late duplicate approval is idempotent', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    await service.applyAttemptOutcome('merchant-a', created.link.id, 'APPROVED');
    expect(
      (await service.applyAttemptOutcome('merchant-a', created.link.id, 'APPROVED')).status
    ).toBe('PAID');
  });
  test('definitive denial leaves a valid link active', async () => {
    const { service } = setup();
    const created = await service.create('merchant-a', input);
    expect(
      (await service.applyAttemptOutcome('merchant-a', created.link.id, 'DENIED')).status
    ).toBe('ACTIVE');
  });
  test.each(['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'MANUAL_REVIEW'])(
    'recognizes unresolved attempt state %s',
    (status) => {
      expect(isUnresolvedAttemptStatus(status)).toBe(true);
    }
  );
  test.each(['APPROVED', 'DENIED', 'EXPIRED'])('recognizes terminal attempt state %s', (status) => {
    expect(isUnresolvedAttemptStatus(status)).toBe(false);
  });
});
