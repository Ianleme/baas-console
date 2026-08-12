import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { GatewayAccountEntity } from '../auth/entities/gateway-account.entity.js';
import { CheckoutLinkEntity } from '../checkout-links/entities/checkout-link.entity.js';
import { EncryptionService } from '../gateway-accounts/encryption.service.js';
import type {
  CheckoutSessionRecord,
  CheckoutSessionStore,
  PublicCheckoutLink
} from './checkout-session.service.js';
import { CheckoutSessionEntity } from './entities/checkout-session.entity.js';

export interface ResolvedCheckoutSession {
  sessionId: string;
  merchantId: string;
  gatewayAccessToken: string;
  link: CheckoutLinkEntity;
}

@Injectable()
export class TypeOrmCheckoutSessionStore implements CheckoutSessionStore {
  constructor(
    private readonly database: DatabaseService,
    private readonly encryption: EncryptionService
  ) {}

  async consumeTokenAndCreateSession(
    publicTokenHash: Buffer,
    session: Omit<CheckoutSessionRecord, 'checkoutLinkId'>
  ): Promise<{ link: PublicCheckoutLink; session: CheckoutSessionRecord } | undefined> {
    return this.database.getDataSource().transaction(async (manager) => {
      const link = await manager
        .createQueryBuilder(CheckoutLinkEntity, 'link')
        .setLock('pessimistic_write')
        .where('HEX(link.public_token_hash) = :hash', {
          hash: publicTokenHash.toString('hex').toUpperCase()
        })
        .andWhere('link.status = :status', { status: 'ACTIVE' })
        .andWhere('link.expires_at > :now', { now: new Date() })
        .andWhere('link.token_closed_at IS NULL')
        .getOne();
      if (!link) return undefined;
      const closed = await manager
        .createQueryBuilder()
        .update(CheckoutLinkEntity)
        .set({ tokenClosedAt: new Date() })
        .where('id = :id', { id: link.id })
        .andWhere('merchant_id = :merchantId', { merchantId: link.merchantId })
        .andWhere('token_closed_at IS NULL')
        .execute();
      if (closed.affected !== 1) return undefined;
      const record: CheckoutSessionRecord = { ...session, checkoutLinkId: link.id };
      await manager.insert(CheckoutSessionEntity, record);
      return { link: publicLink(link), session: record };
    });
  }

  async resolve(
    sessionToken: string,
    csrfToken: string
  ): Promise<ResolvedCheckoutSession | undefined> {
    return this.resolveToken(sessionToken, csrfToken);
  }

  async resolveRead(sessionToken: string): Promise<ResolvedCheckoutSession | undefined> {
    return this.resolveToken(sessionToken);
  }

  private async resolveToken(
    sessionToken: string,
    csrfToken?: string
  ): Promise<ResolvedCheckoutSession | undefined> {
    if (!sessionToken || csrfToken === '') return undefined;
    const session = await this.database.getDataSource().manager.findOne(CheckoutSessionEntity, {
      where: { tokenHash: hash(sessionToken) },
      relations: { checkoutLink: true }
    });
    if (!session || session.expiresAt <= new Date() || session.checkoutLink.status !== 'ACTIVE')
      return undefined;
    if (csrfToken !== undefined) {
      const csrfHash = hash(csrfToken);
      if (!timingSafeEqual(csrfHash, session.csrfTokenHash)) return undefined;
    }
    const account = await this.database.getDataSource().manager.findOne(GatewayAccountEntity, {
      where: { merchantId: session.checkoutLink.merchantId, status: 'ACTIVE' }
    });
    if (!account?.accessTokenCiphertext) return undefined;
    return {
      sessionId: session.id,
      merchantId: session.checkoutLink.merchantId,
      gatewayAccessToken: this.encryption.decrypt(
        account.accessTokenCiphertext,
        account.merchantId,
        account.id,
        'accessToken'
      ),
      link: session.checkoutLink
    };
  }
}

function publicLink(link: CheckoutLinkEntity): PublicCheckoutLink {
  return {
    id: link.id,
    description: link.description,
    amountCents: link.amountCents,
    methods: link.allowedMethods,
    maxInstallments: link.maxInstallments,
    state: 'READY'
  };
}
function hash(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
