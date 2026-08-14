import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { PaymentAttemptEntity } from '../payments/entities/payment-attempt.entity.js';
import type {
  CheckoutLinkListQuery,
  CheckoutLinkListResult,
  CheckoutLinkRecord,
  CheckoutLinkStore
} from './checkout-link.service.js';
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

  async list(merchantId: string, query: CheckoutLinkListQuery): Promise<CheckoutLinkListResult> {
    const base = this.filteredQuery(merchantId, query);
    const [rows, total] = await base
      .clone()
      .orderBy('link.createdAt', 'DESC')
      .addOrderBy('link.id', 'DESC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();
    const summaryQuery = { ...query };
    delete summaryQuery.status;
    const summary = await this.filteredQuery(merchantId, summaryQuery)
      .select('COUNT(*)', 'totalCount')
      .addSelect("SUM(CASE WHEN link.status = 'ACTIVE' THEN 1 ELSE 0 END)", 'activeCount')
      .addSelect("SUM(CASE WHEN link.status = 'PAID' THEN 1 ELSE 0 END)", 'paidCount')
      .addSelect(
        "COALESCE(SUM(CASE WHEN link.status = 'PAID' THEN link.amountCents ELSE 0 END), 0)",
        'paidAmountCents'
      )
      .getRawOne<{
        totalCount: string;
        activeCount: string | null;
        paidCount: string | null;
        paidAmountCents: string;
      }>();
    return {
      items: rows.map((row) => this.record(row)),
      total,
      summary: {
        totalCount: Number(summary?.totalCount ?? 0),
        activeCount: Number(summary?.activeCount ?? 0),
        paidCount: Number(summary?.paidCount ?? 0),
        paidAmountCents: summary?.paidAmountCents ?? '0'
      }
    };
  }

  async expireActiveBefore(merchantId: string, expiresAt: Date): Promise<void> {
    await this.database
      .getDataSource()
      .createQueryBuilder()
      .update(CheckoutLinkEntity)
      .set({ status: 'EXPIRED', tokenClosedAt: expiresAt })
      .where('merchant_id = :merchantId', { merchantId })
      .andWhere('status = :status', { status: 'ACTIVE' })
      .andWhere('expires_at <= :expiresAt', { expiresAt })
      .execute();
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

  async replacePublicTokenIfClosed(
    merchantId: string,
    id: string,
    publicTokenHash: Buffer,
    publicTokenCiphertext: Buffer
  ): Promise<boolean> {
    const result = await this.database
      .getDataSource()
      .createQueryBuilder()
      .update(CheckoutLinkEntity)
      .set({ publicTokenHash, publicTokenCiphertext, tokenClosedAt: null })
      .where('merchant_id = :merchantId', { merchantId })
      .andWhere('id = :id', { id })
      .andWhere('status = :status', { status: 'ACTIVE' })
      .andWhere('token_closed_at IS NOT NULL')
      .execute();
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

  private filteredQuery(merchantId: string, query: CheckoutLinkListQuery) {
    const builder = this.database
      .getDataSource()
      .getRepository(CheckoutLinkEntity)
      .createQueryBuilder('link')
      .where('link.merchantId = :merchantId', { merchantId });
    if (query.search) {
      const search = `%${query.search.replaceAll('=', '==').replaceAll('%', '=%').replaceAll('_', '=_')}%`;
      builder.andWhere(
        "(link.description LIKE :search ESCAPE '=' OR link.publicReference LIKE :search ESCAPE '=')",
        { search }
      );
    }
    if (query.status) builder.andWhere('link.status = :status', { status: query.status });
    if (query.method) builder.andWhere('link.allowedMethods = :method', { method: query.method });
    if (query.createdFrom)
      builder.andWhere('link.createdAt >= :createdFrom', { createdFrom: query.createdFrom });
    if (query.createdTo)
      builder.andWhere('link.createdAt <= :createdTo', { createdTo: query.createdTo });
    return builder;
  }
}
