import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { DatabaseService } from '../../database/database.service.js';
import { AuthError, type AuthStore, type LocalSession, type LocalUser } from './auth.service.js';
import { AuthSessionEntity, MerchantEntity, UserEntity } from './entities/index.js';

@Injectable()
export class TypeOrmAuthStore implements AuthStore {
  private readonly transactionManager = new AsyncLocalStorage<EntityManager>();
  constructor(private readonly database: DatabaseService) {}

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.database
      .getDataSource()
      .transaction((manager) => this.transactionManager.run(manager, operation));
  }

  async createOwner(input: Parameters<AuthStore['createOwner']>[0]): Promise<LocalUser> {
    const manager = this.manager();
    await manager.save(
      manager.create(MerchantEntity, {
        id: input.merchantId,
        legalName: input.legalName,
        displayName: input.displayName,
        status: 'ACTIVE',
        demoMode: false
      })
    );
    const user = await manager.save(
      manager.create(UserEntity, {
        id: input.userId,
        merchantId: input.merchantId,
        email: input.email,
        emailNormalized: input.emailNormalized,
        fullName: input.fullName,
        passwordHash: input.passwordHash,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    );
    return this.toUser(user);
  }

  async findUserByEmail(emailNormalized: string): Promise<LocalUser | undefined> {
    const user = await this.manager().findOne(UserEntity, { where: { emailNormalized } });
    return user ? this.toUser(user) : undefined;
  }
  async findUserById(userId: string): Promise<LocalUser | undefined> {
    const user = await this.manager().findOne(UserEntity, { where: { id: userId } });
    return user ? this.toUser(user) : undefined;
  }
  async saveSession(session: LocalSession): Promise<void> {
    await this.manager().insert(AuthSessionEntity, session);
  }
  async findSession(refreshTokenHash: Buffer): Promise<LocalSession | undefined> {
    const session = await this.manager().findOne(AuthSessionEntity, {
      where: { refreshTokenHash }
    });
    return session ? this.toSession(session) : undefined;
  }
  findSessionHash(refreshToken: string): Promise<LocalSession | undefined> {
    return this.findSession(createHash('sha256').update(refreshToken, 'utf8').digest());
  }
  async rotateSession(current: LocalSession, replacement: LocalSession, at: Date): Promise<void> {
    await this.database.getDataSource().transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(AuthSessionEntity)
        .set({ rotatedAt: at })
        .where('id = :id AND rotated_at IS NULL AND revoked_at IS NULL', { id: current.id })
        .execute();
      if (result.affected !== 1) throw new AuthError('SESSION_INVALID');
      await manager.insert(AuthSessionEntity, replacement);
    });
  }
  async revokeFamily(familyId: string, at: Date, reuseDetected: boolean): Promise<void> {
    await this.manager()
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: at, ...(reuseDetected ? { reuseDetectedAt: at } : {}) })
      .where('family_id = :familyId', { familyId })
      .execute();
  }
  async revokeSession(sessionId: string, at: Date): Promise<void> {
    await this.manager().update(AuthSessionEntity, { id: sessionId }, { revokedAt: at });
  }
  async revokeUserSessions(userId: string, at: Date): Promise<void> {
    await this.manager().update(AuthSessionEntity, { userId }, { revokedAt: at });
  }

  private manager(): EntityManager {
    return this.transactionManager.getStore() ?? this.database.getDataSource().manager;
  }
  private toUser(user: UserEntity): LocalUser {
    return {
      id: user.id,
      merchantId: user.merchantId,
      email: user.email,
      emailNormalized: user.emailNormalized,
      fullName: user.fullName,
      passwordHash: user.passwordHash,
      status: user.status
    };
  }
  private toSession(session: AuthSessionEntity): LocalSession {
    return {
      id: session.id,
      merchantId: session.merchantId,
      userId: session.userId,
      familyId: session.familyId,
      refreshTokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt,
      rotatedAt: session.rotatedAt,
      revokedAt: session.revokedAt,
      reuseDetectedAt: session.reuseDetectedAt
    };
  }
}
