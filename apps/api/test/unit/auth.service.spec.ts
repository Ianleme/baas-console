import * as argon2 from 'argon2';

import {
  assertTenantResource,
  AuthError,
  AuthService,
  type AuthStore,
  FixedWindowRateLimiter,
  type LocalSession,
  type LocalUser,
  normalizeEmail
} from '../../src/modules/auth/auth.service.js';

class MemoryStore implements AuthStore {
  users: LocalUser[] = [];
  sessions: LocalSession[] = [];
  transactionCalls = 0;
  failCreate = false;

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const users = [...this.users];
    try {
      return await operation();
    } catch (error) {
      this.users = users;
      throw error;
    }
  }
  createOwner(input: Parameters<AuthStore['createOwner']>[0]): Promise<LocalUser> {
    if (this.failCreate) return Promise.reject(new Error('db'));
    const user: LocalUser = {
      id: input.userId,
      merchantId: input.merchantId,
      email: input.email,
      emailNormalized: input.emailNormalized,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      status: 'ACTIVE'
    };
    this.users.push(user);
    return Promise.resolve(user);
  }
  findUserByEmail(email: string): Promise<LocalUser | undefined> {
    return Promise.resolve(this.users.find((user) => user.emailNormalized === email));
  }
  findUserById(userId: string): Promise<LocalUser | undefined> {
    return Promise.resolve(this.users.find((user) => user.id === userId));
  }
  saveSession(session: LocalSession): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }
  findSession(hash: Buffer): Promise<LocalSession | undefined> {
    return Promise.resolve(this.sessions.find((session) => session.refreshTokenHash.equals(hash)));
  }
  rotateSession(current: LocalSession, replacement: LocalSession, at: Date): Promise<void> {
    current.rotatedAt = at;
    this.sessions.push(replacement);
    return Promise.resolve();
  }
  revokeFamily(familyId: string, at: Date, reuse: boolean): Promise<void> {
    for (const session of this.sessions.filter((item) => item.familyId === familyId)) {
      session.revokedAt = at;
      if (reuse) session.reuseDetectedAt = at;
    }
    return Promise.resolve();
  }
  revokeSession(id: string, at: Date): Promise<void> {
    const session = this.sessions.find((item) => item.id === id);
    if (session) session.revokedAt = at;
    return Promise.resolve();
  }
  revokeUserSessions(userId: string, at: Date): Promise<void> {
    for (const session of this.sessions.filter((item) => item.userId === userId))
      session.revokedAt = at;
    return Promise.resolve();
  }
}

const now = new Date('2026-08-12T12:00:00.000Z');
const validInput = {
  legalName: 'Loja Aurora Ltda',
  displayName: 'Loja Aurora',
  fullName: '  Owner Aurora  ',
  email: 'Owner@Example.Test',
  password: 'StrongPassword123'
};

describe('AuthService', () => {
  let store: MemoryStore;
  let service: AuthService;
  beforeEach(() => {
    store = new MemoryStore();
    service = new AuthService(store, () => now, 'unit-test-auth-secret-at-least-32-bytes');
  });

  it('creates one owner through a transaction', async () => {
    await service.registerOwner(validInput);
    expect(store.transactionCalls).toBe(1);
    expect(store.users).toHaveLength(1);
  });
  it('normalizes owner email', async () => {
    const user = await service.registerOwner(validInput);
    expect(user.emailNormalized).toBe('owner@example.test');
  });
  it('persists the validated owner full name', async () => {
    const user = await service.registerOwner(validInput);
    expect(user.fullName).toBe('Owner Aurora');
  });
  it('hashes owner password with Argon2id', async () => {
    const user = await service.registerOwner(validInput);
    expect(user.passwordHash).toContain('$argon2id$');
    await expect(argon2.verify(user.passwordHash, validInput.password)).resolves.toBe(true);
  });
  it('uses distinct tenant and user identifiers', async () => {
    const user = await service.registerOwner(validInput);
    expect(user.id).not.toBe(user.merchantId);
  });
  it('rejects weak passwords', async () => {
    await expect(service.registerOwner({ ...validInput, password: 'weak' })).rejects.toMatchObject({
      code: 'WEAK_PASSWORD'
    });
  });
  it('rejects malformed emails', async () => {
    await expect(service.registerOwner({ ...validInput, email: 'invalid' })).rejects.toMatchObject({
      code: 'INVALID_EMAIL'
    });
  });
  it('rolls back owner creation failures', async () => {
    store.failCreate = true;
    await expect(service.registerOwner(validInput)).rejects.toThrow('db');
    expect(store.users).toHaveLength(0);
  });
  it('authenticates valid credentials', async () => {
    await service.registerOwner(validInput);
    await expect(service.login(validInput.email, validInput.password)).resolves.toHaveProperty(
      'principal.merchantId'
    );
  });
  it('rejects wrong passwords generically', async () => {
    await service.registerOwner(validInput);
    await expect(service.login(validInput.email, 'WrongPassword123')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });
  it('rejects unknown users generically', async () => {
    await expect(service.login('none@example.test', 'WrongPassword123')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });
  it('rejects disabled users', async () => {
    const user = await service.registerOwner(validInput);
    user.status = 'DISABLED';
    await expect(service.login(validInput.email, validInput.password)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });
  it('issues 15-minute access tokens', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    expect(issued.accessExpiresAt.getTime() - now.getTime()).toBe(900000);
  });
  it('issues opaque refresh tokens without persisting plaintext', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    expect(store.sessions[0]?.refreshTokenHash.toString('hex')).not.toContain(issued.refreshToken);
  });
  it('sets secure host-only cookie attributes', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    expect(issued.cookie).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth'
    });
  });
  it('rotates a refresh token in the same family', async () => {
    await service.registerOwner(validInput);
    const first = await service.login(validInput.email, validInput.password);
    const second = await service.rotate(first.refreshToken, first.csrfToken, first.csrfToken);
    expect(store.sessions).toHaveLength(2);
    expect(store.sessions[0]?.familyId).toBe(store.sessions[1]?.familyId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });
  it('detects refresh reuse and revokes the family', async () => {
    await service.registerOwner(validInput);
    const first = await service.login(validInput.email, validInput.password);
    await service.rotate(first.refreshToken, first.csrfToken, first.csrfToken);
    await expect(
      service.rotate(first.refreshToken, first.csrfToken, first.csrfToken)
    ).rejects.toMatchObject({ code: 'SESSION_REUSE_DETECTED' });
    expect(store.sessions.every((item) => item.revokedAt)).toBe(true);
  });
  it('rejects missing refresh tokens', async () => {
    await expect(service.rotate('missing', 'csrf', 'csrf')).rejects.toMatchObject({
      code: 'SESSION_INVALID'
    });
  });
  it('rejects expired refresh tokens', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    const session = store.sessions[0];
    if (!session) throw new Error('TEST_SESSION_MISSING');
    session.expiresAt = now;
    await expect(
      service.rotate(issued.refreshToken, issued.csrfToken, issued.csrfToken)
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });
  it('requires matching CSRF tokens on rotation', async () => {
    await expect(service.rotate('token', 'left', 'right')).rejects.toMatchObject({
      code: 'CSRF_INVALID'
    });
  });
  it('revokes one session on logout', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    await service.logout(issued.refreshToken, issued.csrfToken, issued.csrfToken);
    expect(store.sessions[0]?.revokedAt).toEqual(now);
  });
  it('revokes all user sessions', async () => {
    const user = await service.registerOwner(validInput);
    const a = await service.login(validInput.email, validInput.password);
    await service.login(validInput.email, validInput.password);
    await service.logoutAll(user.id, a.csrfToken, a.csrfToken);
    expect(store.sessions.every((item) => item.revokedAt)).toBe(true);
  });
  it('derives tenant access exclusively from the session principal', () => {
    expect(assertTenantResource({ merchantId: 'tenant-a', id: 'one' }, 'tenant-a')).toHaveProperty(
      'id',
      'one'
    );
  });
  it('hides cross-tenant resources as not found', () => {
    expect(() => assertTenantResource({ merchantId: 'tenant-b' }, 'tenant-a')).toThrow(
      'RESOURCE_NOT_FOUND'
    );
  });
  it('hides missing resources as not found', () => {
    expect(() => assertTenantResource(undefined, 'tenant-a')).toThrow('RESOURCE_NOT_FOUND');
  });
  it('enforces a fixed-window rate limit', () => {
    const limiter = new FixedWindowRateLimiter(2, 60000, () => 0);
    limiter.consume('ip');
    limiter.consume('ip');
    expect(() => {
      limiter.consume('ip');
    }).toThrow('RATE_LIMITED');
  });
  it('normalizes email deterministically', () => {
    expect(normalizeEmail(' OWNER@EXAMPLE.TEST ')).toBe('owner@example.test');
  });
  it('exposes stable typed error codes', () => {
    expect(new AuthError('RATE_LIMITED').code).toBe('RATE_LIMITED');
  });

  it('verifies a signed access token and rejects tampering', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    expect(service.verifyAccessToken(issued.accessToken)).toEqual(issued.principal);
    expect(() => service.verifyAccessToken(`${issued.accessToken}x`)).toThrow('AUTH_REQUIRED');
  });
  it('rejects expired access tokens', async () => {
    await service.registerOwner(validInput);
    const issued = await service.login(validInput.email, validInput.password);
    service = new AuthService(
      store,
      () => new Date(now.getTime() + 900001),
      'unit-test-auth-secret-at-least-32-bytes'
    );
    expect(() => service.verifyAccessToken(issued.accessToken)).toThrow('AUTH_REQUIRED');
  });
  it('fails fast when access-token signing is not configured', async () => {
    service = new AuthService(store, () => now, 'short');
    const user = await service.registerOwner(validInput);
    await expect(service.login(user.email, validInput.password)).rejects.toMatchObject({
      code: 'AUTH_CONFIGURATION_INVALID'
    });
  });
});
