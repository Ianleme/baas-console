import {
  CheckoutSessionService,
  publicCheckoutHeaders,
  type CheckoutSessionRecord,
  type CheckoutSessionStore,
  type PublicCheckoutLink
} from '../../src/modules/public-checkout/checkout-session.service.js';

class MemoryStore implements CheckoutSessionStore {
  consumed = false;
  sessions: CheckoutSessionRecord[] = [];
  link: PublicCheckoutLink = {
    id: 'link-1',
    description: 'Pedido sandbox',
    amountCents: '32000',
    methods: 'PIX_CARD',
    maxInstallments: 3,
    state: 'READY'
  };
  consumeTokenAndCreateSession(
    _publicTokenHash: Buffer,
    session: Omit<CheckoutSessionRecord, 'checkoutLinkId'>
  ): Promise<{ link: PublicCheckoutLink; session: CheckoutSessionRecord } | undefined> {
    if (this.consumed || this.link.state !== 'READY') return Promise.resolve(undefined);
    this.consumed = true;
    const record = { ...session, checkoutLinkId: this.link.id };
    this.sessions.push(record);
    return Promise.resolve({ link: this.link, session: record });
  }
}
const now = new Date('2026-08-12T12:00:00.000Z');
const publicToken = Buffer.alloc(32, 7).toString('base64url');
function setup() {
  const store = new MemoryStore();
  let sequence = 0;
  const service = new CheckoutSessionService(
    store,
    () => now,
    () => 'session-id',
    () => Buffer.alloc(32, ++sequence).toString('base64url')
  );
  return { store, service };
}

describe('CheckoutSessionService', () => {
  test('atomically exchanges a valid public token', async () => {
    const { service } = setup();
    await expect(service.exchange(publicToken)).resolves.toHaveProperty('checkout.id', 'link-1');
  });
  test('rejects a second exchange of the same token', async () => {
    const { service } = setup();
    await service.exchange(publicToken);
    await expect(service.exchange(publicToken)).rejects.toMatchObject({
      code: 'CHECKOUT_LINK_UNAVAILABLE'
    });
  });
  test('permits only one winner under concurrent exchange', async () => {
    const { service } = setup();
    const results = await Promise.allSettled([
      service.exchange(publicToken),
      service.exchange(publicToken)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  test.each(['', 'short', Buffer.alloc(31).toString('base64url')])(
    'rejects malformed token %#',
    async (token) => {
      const { service } = setup();
      await expect(service.exchange(token)).rejects.toMatchObject({ code: 'PUBLIC_TOKEN_INVALID' });
    }
  );
  test.each(['EXPIRED', 'PAID', 'CANCELLED'] as const)(
    'does not exchange a %s link',
    async (state) => {
      const { store, service } = setup();
      store.link.state = state;
      await expect(service.exchange(publicToken)).rejects.toMatchObject({
        code: 'CHECKOUT_LINK_UNAVAILABLE'
      });
    }
  );
  test('stores only hashes of session and CSRF tokens', async () => {
    const { store, service } = setup();
    const result = await service.exchange(publicToken);
    const persisted = JSON.stringify(store.sessions);
    expect(persisted).not.toContain(result.sessionToken);
    expect(persisted).not.toContain(result.csrfToken);
  });
  test('expires the session after ten minutes', async () => {
    const { store, service } = setup();
    await service.exchange(publicToken);
    expect(store.sessions[0]?.expiresAt.getTime() - now.getTime()).toBe(600000);
  });
  test('returns a secure host-only checkout cookie policy', async () => {
    const { service } = setup();
    expect((await service.exchange(publicToken)).cookie).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/public/checkout',
      maxAgeSeconds: 600
    });
  });
  test('disables storage and referrer propagation', () => {
    expect(publicCheckoutHeaders()).toMatchObject({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    });
  });
  test('isolates the checkout CSP from third parties and framing', () => {
    const csp = publicCheckoutHeaders()['content-security-policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('https:');
    expect(csp).not.toContain('*');
  });
});
