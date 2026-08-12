import type { DataSource } from 'typeorm';
import type { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import type { StatementGatewayAdapter } from './adapters/lera-box-statement.adapter.js';
import type { ListTransactionsDto } from './dto/list-transactions.dto.ts';
import {
  TransactionEntity,
  type TransactionOriginType,
  type TransactionStatus,
  type TransactionType
} from './entities/transaction.entity.js';

export interface TransactionItemView {
  id: string;
  originType: TransactionOriginType;
  originId: string;
  externalReference: string;
  gatewayTransactionId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  grossAmountCents: string;
  feeAmountCents: string;
  netAmountCents: string;
  occurredAt: string;
}

export interface TransactionStatementView {
  items: TransactionItemView[];
  total: number;
  stale: boolean;
  capturedAt: string;
}

export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: StatementGatewayAdapter,
    private readonly credentials: GatewayCredentialService
  ) {}

  async list(merchantId: string, query: ListTransactionsDto): Promise<TransactionStatementView> {
    const capturedAt = new Date().toISOString();
    let stale = false;

    // Fetch tenant-scoped local transactions from DB
    const qb = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder('tx')
      .where('tx.merchantId = :merchantId', { merchantId });

    if (query.status) {
      qb.andWhere('tx.status = :status', { status: query.status });
    }
    if (query.type) {
      qb.andWhere('tx.type = :type', { type: query.type });
    }
    if (query.originType) {
      qb.andWhere('tx.originType = :originType', { originType: query.originType });
    }
    if (query.reference) {
      qb.andWhere('LOWER(tx.externalReference) LIKE LOWER(:ref)', { ref: `%${query.reference}%` });
    }

    qb.orderBy('tx.occurredAt', 'DESC').skip(query.offset).take(query.limit);

    const [records, total] = await qb.getManyAndCount();

    // Check if remote gateway synchronization is available
    try {
      const creds = this.credentials as {
        getActiveGatewayAuth(id: string): Promise<{ accessToken?: string } | null>;
      };
      const auth = await creds.getActiveGatewayAuth(merchantId);
      if (auth?.accessToken) {
        const remoteTransactions = await this.gateway.listStatement(auth.accessToken);
        const remoteMap = new Map(remoteTransactions.map((item) => [item.id, item]));

        // Merge remote status updates into local projections in memory
        for (const record of records) {
          if (record.gatewayTransactionId) {
            const remote = remoteMap.get(record.gatewayTransactionId);
            if (remote) {
              if (remote.status === 'APPROVED' && record.status !== 'APPROVED') {
                record.status = 'APPROVED';
              } else if (remote.status === 'DENIED' && record.status !== 'DENIED') {
                record.status = 'DENIED';
              }
            }
          }
        }
      }
    } catch {
      stale = true;
    }

    const items: TransactionItemView[] = records.map((record) => ({
      id: record.id,
      originType: record.originType,
      originId: record.originId,
      externalReference: record.externalReference,
      gatewayTransactionId: record.gatewayTransactionId,
      type: record.type,
      status: record.status,
      grossAmountCents: record.grossAmountCents,
      feeAmountCents: record.feeAmountCents,
      netAmountCents: record.netAmountCents,
      occurredAt: record.occurredAt.toISOString()
    }));

    return {
      items,
      total,
      stale,
      capturedAt
    };
  }
}
