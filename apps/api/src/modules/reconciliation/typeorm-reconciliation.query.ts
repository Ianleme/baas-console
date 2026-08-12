import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { PaymentAttemptEntity } from '../payments/entities/payment-attempt.entity.js';
import { WithdrawalEntity } from '../withdrawals/entities/withdrawal.entity.js';
import type { ReconciliationQuery, ReconciliationView } from './reconciliation.controller.js';

@Injectable()
export class TypeOrmReconciliationQuery implements ReconciliationQuery {
  constructor(private readonly database: DatabaseService) {}
  async list(merchantId: string): Promise<ReconciliationView[]> {
    const [payments, withdrawals] = await Promise.all([
      this.database.getDataSource().manager.find(PaymentAttemptEntity, { where: { merchantId } }),
      this.database.getDataSource().manager.find(WithdrawalEntity, { where: { merchantId } })
    ]);
    return [
      ...payments.map((row) =>
        view(row.id, 'PAYMENT', row.externalReference, row.status, row.updatedAt)
      ),
      ...withdrawals.map((row) =>
        view(row.id, 'WITHDRAWAL', row.externalReference, row.status, row.updatedAt)
      )
    ].filter((row) => ['RECONCILIATION_PENDING', 'MANUAL_REVIEW'].includes(row.status));
  }
}
function view(
  id: string,
  kind: 'PAYMENT' | 'WITHDRAWAL',
  reference: string,
  status: string,
  updatedAt: Date
): ReconciliationView {
  return {
    id,
    kind,
    reference,
    status,
    classification: status === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : 'LOCAL_ONLY',
    updatedAt: updatedAt.toISOString()
  };
}
