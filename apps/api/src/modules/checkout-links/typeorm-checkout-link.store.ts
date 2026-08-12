import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { PaymentAttemptEntity } from '../payments/entities/payment-attempt.entity.js';
import type { CheckoutLinkRecord, CheckoutLinkStore } from './checkout-link.service.js';
import { isUnresolvedAttemptStatus } from './checkout-link.service.js';
import { CheckoutLinkEntity } from './entities/checkout-link.entity.js';

@Injectable()
export class TypeOrmCheckoutLinkStore implements CheckoutLinkStore {
  constructor(private readonly database: DatabaseService) {}

  async create(link: CheckoutLinkRecord): Promise<void> {
    await this.database.getDataSource().manager.save(
      this.database.getDataSource().manager.create(CheckoutLinkEntity, {
        ...link,
        feeSnapshotJson: link.feeSnapshot as unknown as Record<string, unknown>
      })
    );
  }

  async list(merchantId: string): Promise<CheckoutLinkRecord[]> {
    const rows = await this.database.getDataSource().manager.find(CheckoutLinkEntity, {
      where: { merchantId },
      order: { createdAt: 'DESC' }
    });
    return rows.map((row) => this.record(row));
  }

  async find(merchantId: string, id: string): Promise<CheckoutLinkRecord | undefined> {
    const row = await this.database.getDataSource().manager.findOne(CheckoutLinkEntity, {
      where: { merchantId, id }
    });
    return row ? this.record(row) : undefined;
  }

  async setStatus(
    merchantId: string,
    id: string,
    expected: CheckoutLinkRecord['status'],
    next: CheckoutLinkRecord['status'],
    tokenClosedAt: Date | null
  ): Promise<boolean> {
    const result = await this.database
      .getDataSource()
      .manager.update(
        CheckoutLinkEntity,
        { merchantId, id, status: expected },
        { status: next, tokenClosedAt }
      );
    return result.affected === 1;
  }

  async hasUnresolvedAttempt(merchantId: string, checkoutLinkId: string): Promise<boolean> {
    const rows = await this.database.getDataSource().manager.find(PaymentAttemptEntity, {
      where: { merchantId, checkoutLinkId }
    });
    return rows.some((row) => isUnresolvedAttemptStatus(row.status));
  }

  private record(row: CheckoutLinkEntity): CheckoutLinkRecord {
    return {
      id: row.id,
      merchantId: row.merchantId,
      publicReference: row.publicReference,
      description: row.description,
      amountCents: row.amountCents,
      allowedMethods: row.allowedMethods,
      maxInstallments: row.maxInstallments,
      feeSnapshot: Array.isArray(row.feeSnapshotJson) ? (row.feeSnapshotJson as never) : [],
      status: row.status,
      expiresAt: row.expiresAt,
      publicTokenHash: row.publicTokenHash,
      publicTokenCiphertext: row.publicTokenCiphertext,
      tokenClosedAt: row.tokenClosedAt,
      createdAt: row.createdAt
    };
  }
}
