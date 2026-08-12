import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import * as argon2 from 'argon2';

export interface LocalUser {
  id: string;
  merchantId: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  status: 'ACTIVE' | 'DISABLED';
}

export interface LocalSession {
  id: string;
  merchantId: string;
  userId: string;
  familyId: string;
  refreshTokenHash: Buffer;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  reuseDetectedAt: Date | null;
}

export interface AuthStore {
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  createOwner(input: {
    merchantId: string;
    userId: string;
    legalName: string;
    displayName: string;
    email: string;
    emailNormalized: string;
    passwordHash: string;
  }): Promise<LocalUser>;
  findUserByEmail(emailNormalized: string): Promise<LocalUser | undefined>;
  saveSession(session: LocalSession): Promise<void>;
  findSession(refreshTokenHash: Buffer): Promise<LocalSession | undefined>;
  rotateSession(current: LocalSession, replacement: LocalSession, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date, reuseDetected: boolean): Promise<void>;
  revokeSession(sessionId: string, at: Date): Promise<void>;
  revokeUserSessions(userId: string, at: Date): Promise<void>;
}

export class AuthError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface IssuedSession {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  csrfToken: string;
  cookie: { httpOnly: true; secure: true; sameSite: 'strict'; path: '/api/v1/auth' };
  principal: { userId: string; merchantId: string };
}

const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly now: () => Date = () => new Date(),
    private readonly tokenSecret: string = process.env.AUTH_TOKEN_SECRET ?? ''
  ) {}

  async registerOwner(input: {
    legalName: string;
    displayName: string;
    email: string;
    password: string;
  }): Promise<LocalUser> {
    const emailNormalized = normalizeEmail(input.email);
    validatePassword(input.password);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return this.store.transaction(() =>
      this.store.createOwner({
        merchantId: randomUUID(),
        userId: randomUUID(),
        legalName: input.legalName.trim(),
        displayName: input.displayName.trim(),
        email: input.email.trim(),
        emailNormalized,
        passwordHash
      })
    );
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.store.findUserByEmail(normalizeEmail(email));
    if (user?.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, password))) {
      throw new AuthError('INVALID_CREDENTIALS');
    }
    return this.issue(user);
  }

  async rotate(
    refreshToken: string,
    csrfCookie: string,
    csrfHeader: string
  ): Promise<IssuedSession> {
    verifyCsrf(csrfCookie, csrfHeader);
    const hash = tokenHash(refreshToken);
    const current = await this.store.findSession(hash);
    if (!current) throw new AuthError('SESSION_INVALID');
    const at = this.now();
    if (current.rotatedAt || current.reuseDetectedAt) {
      await this.store.revokeFamily(current.familyId, at, true);
      throw new AuthError('SESSION_REUSE_DETECTED');
    }
    if (current.revokedAt || current.expiresAt <= at) throw new AuthError('SESSION_INVALID');
    return this.issue(
      {
        id: current.userId,
        merchantId: current.merchantId,
        email: '',
        emailNormalized: '',
        passwordHash: '',
        status: 'ACTIVE'
      },
      current
    );
  }

  async logout(refreshToken: string, csrfCookie: string, csrfHeader: string): Promise<void> {
    verifyCsrf(csrfCookie, csrfHeader);
    const session = await this.store.findSession(tokenHash(refreshToken));
    if (session) await this.store.revokeSession(session.id, this.now());
  }

  async logoutAll(userId: string, csrfCookie: string, csrfHeader: string): Promise<void> {
    verifyCsrf(csrfCookie, csrfHeader);
    await this.store.revokeUserSessions(userId, this.now());
  }

  private async issue(user: LocalUser, current?: LocalSession): Promise<IssuedSession> {
    const at = this.now();
    const refreshToken = randomBytes(32).toString('base64url');
    const replacement: LocalSession = {
      id: randomUUID(),
      merchantId: user.merchantId,
      userId: user.id,
      familyId: current?.familyId ?? randomUUID(),
      refreshTokenHash: tokenHash(refreshToken),
      expiresAt: new Date(at.getTime() + REFRESH_TTL_MS),
      rotatedAt: null,
      revokedAt: null,
      reuseDetectedAt: null
    };
    if (current) await this.store.rotateSession(current, replacement, at);
    else await this.store.saveSession(replacement);
    return {
      accessToken: this.createAccessToken(user.id, user.merchantId, at),
      accessExpiresAt: new Date(at.getTime() + ACCESS_TTL_MS),
      refreshToken,
      refreshExpiresAt: replacement.expiresAt,
      csrfToken: randomBytes(24).toString('base64url'),
      cookie: { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth' },
      principal: { userId: user.id, merchantId: user.merchantId }
    };
  }

  verifyAccessToken(token: string): { userId: string; merchantId: string } {
    if (this.tokenSecret.length < 32) throw new AuthError('AUTH_CONFIGURATION_INVALID');
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) throw new AuthError('AUTH_REQUIRED');
    const expected = createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right))
      throw new AuthError('AUTH_REQUIRED');
    try {
      const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      if (
        typeof value.userId !== 'string' ||
        typeof value.merchantId !== 'string' ||
        typeof value.exp !== 'number' ||
        value.exp <= this.now().getTime()
      )
        throw new Error();
      return { userId: value.userId, merchantId: value.merchantId };
    } catch {
      throw new AuthError('AUTH_REQUIRED');
    }
  }

  private createAccessToken(userId: string, merchantId: string, at: Date): string {
    if (this.tokenSecret.length < 32) throw new AuthError('AUTH_CONFIGURATION_INVALID');
    const encoded = Buffer.from(
      JSON.stringify({ userId, merchantId, exp: at.getTime() + ACCESS_TTL_MS }),
      'utf8'
    ).toString('base64url');
    return `${encoded}.${createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url')}`;
  }
}

export class FixedWindowRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  consume(key: string): void {
    const now = this.now();
    const current = this.attempts.get(key);
    const window =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : current;
    window.count += 1;
    this.attempts.set(key, window);
    if (window.count > this.limit) throw new AuthError('RATE_LIMITED');
  }
}

export function assertTenantResource<T extends { merchantId: string }>(
  resource: T | undefined,
  sessionMerchantId: string
): T {
  if (!resource || resource.merchantId !== sessionMerchantId)
    throw new AuthError('RESOURCE_NOT_FOUND');
  return resource;
}

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) throw new AuthError('INVALID_EMAIL');
  return normalized;
}

function validatePassword(password: string): void {
  if (
    password.length < 12 ||
    !/[a-z]/u.test(password) ||
    !/[A-Z]/u.test(password) ||
    !/\d/u.test(password)
  ) {
    throw new AuthError('WEAK_PASSWORD');
  }
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function verifyCsrf(cookie: string, header: string): void {
  const left = Buffer.from(cookie);
  const right = Buffer.from(header);
  if (left.length === 0 || left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AuthError('CSRF_INVALID');
  }
}
