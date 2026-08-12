import { createHash, randomBytes, randomUUID } from 'node:crypto';

export type PublicCheckoutState = 'READY' | 'EXPIRED' | 'PAID' | 'CANCELLED';
export interface PublicCheckoutLink {
  id: string;
  description: string;
  amountCents: string;
  methods: 'PIX' | 'CARD' | 'PIX_CARD';
  maxInstallments: number;
  state: PublicCheckoutState;
}
export interface CheckoutSessionRecord {
  id: string;
  checkoutLinkId: string;
  tokenHash: Buffer;
  csrfTokenHash: Buffer;
  expiresAt: Date;
}
export interface CheckoutSessionStore {
  consumeTokenAndCreateSession(
    publicTokenHash: Buffer,
    session: Omit<CheckoutSessionRecord, 'checkoutLinkId'>
  ): Promise<{ link: PublicCheckoutLink; session: CheckoutSessionRecord } | undefined>;
}
export interface CheckoutSessionResult {
  checkout: PublicCheckoutLink;
  csrfToken: string;
  sessionToken: string;
  cookie: {
    httpOnly: true;
    secure: true;
    sameSite: 'strict';
    path: '/api/v1/public/checkout';
    maxAgeSeconds: 600;
  };
  headers: Record<string, string>;
}
export class CheckoutSessionError extends Error {
  constructor(readonly code: 'CHECKOUT_LINK_UNAVAILABLE' | 'PUBLIC_TOKEN_INVALID') {
    super(code);
    this.name = 'CheckoutSessionError';
  }
}

const SESSION_TTL_MS = 10 * 60_000;

export class CheckoutSessionService {
  constructor(
    private readonly store: CheckoutSessionStore,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
    private readonly secret: () => string = () => randomBytes(32).toString('base64url')
  ) {}

  async exchange(publicToken: string): Promise<CheckoutSessionResult> {
    if (typeof publicToken !== 'string' || Buffer.from(publicToken, 'base64url').byteLength < 32)
      throw new CheckoutSessionError('PUBLIC_TOKEN_INVALID');
    const at = this.now();
    const sessionToken = this.secret();
    const csrfToken = this.secret();
    const consumed = await this.store.consumeTokenAndCreateSession(hash(publicToken), {
      id: this.id(),
      tokenHash: hash(sessionToken),
      csrfTokenHash: hash(csrfToken),
      expiresAt: new Date(at.getTime() + SESSION_TTL_MS)
    });
    if (!consumed) throw new CheckoutSessionError('CHECKOUT_LINK_UNAVAILABLE');
    return {
      checkout: consumed.link,
      csrfToken,
      sessionToken,
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/public/checkout',
        maxAgeSeconds: 600
      },
      headers: publicCheckoutHeaders()
    };
  }
}

export function publicCheckoutHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
}

function hash(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
