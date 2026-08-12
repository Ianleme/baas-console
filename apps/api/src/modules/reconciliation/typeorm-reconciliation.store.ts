import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { DatabaseService } from '../../database/database.service.js';
import { PaymentAttemptEntity } from '../payments/entities/payment-attempt.entity.js';
import { WithdrawalEntity } from '../withdrawals/entities/withdrawal.entity.js';
import type { LocalFinancialOperation, ReconciliationStore } from './reconciliation.service.js';

@Injectable()
export class TypeOrmReconciliationStore implements ReconciliationStore {
  constructor(private readonly database: DatabaseService) {}
  async find(merchantId: string, operationId: string) {
    const payment = await this.database
      .getDataSource()
      .manager.findOne(PaymentAttemptEntity, { where: { merchantId, id: operationId } });
    if (payment) return paymentOperation(payment);
    const withdrawal = await this.database
      .getDataSource()
      .manager.findOne(WithdrawalEntity, { where: { merchantId, id: operationId } });
    return withdrawal ? withdrawalOperation(withdrawal) : undefined;
  }
  async findByExternalReference(merchantId: string, externalReference: string) {
    const payment = await this.database
      .getDataSource()
      .manager.findOne(PaymentAttemptEntity, { where: { merchantId, externalReference } });
    if (payment) return paymentOperation(payment);
    const withdrawal = await this.database
      .getDataSource()
      .manager.findOne(WithdrawalEntity, { where: { merchantId, externalReference } });
    return withdrawal ? withdrawalOperation(withdrawal) : undefined;
  }
  async applyOutcome(
    merchantId: string,
    operationId: string,
    expectedStatuses: string[],
    status: 'APPROVED' | 'DENIED' | 'PENDING' | 'EXPIRED',
    gatewayId: string
  ) {
    const payment = await this.database
      .getDataSource()
      .manager.update(
        PaymentAttemptEntity,
        { id: operationId, merchantId, status: In(expectedStatuses as never[]) },
        { status, gatewayPaymentId: gatewayId }
      );
    if (payment.affected === 1) return true;
    if (status === 'EXPIRED') return false;
    const withdrawal = await this.database
      .getDataSource()
      .manager.update(
        WithdrawalEntity,
        { id: operationId, merchantId, status: In(expectedStatuses as never[]) },
        { status, gatewayWithdrawalId: gatewayId }
      );
    return withdrawal.affected === 1;
  }
  async markReview(merchantId: string, operationId: string, reason: string): Promise<void> {
    const payment = await this.database
      .getDataSource()
      .manager.update(
        PaymentAttemptEntity,
        { id: operationId, merchantId },
        { status: 'MANUAL_REVIEW', failureCode: reason }
      );
    if (payment.affected !== 1)
      await this.database
        .getDataSource()
        .manager.update(
          WithdrawalEntity,
          { id: operationId, merchantId },
          { status: 'MANUAL_REVIEW', lastErrorCode: reason }
        );
  }
  record(): Promise<void> {
    return Promise.resolve();
  }
}

function paymentOperation(row: PaymentAttemptEntity): LocalFinancialOperation {
  return {
    id: row.id,
    merchantId: row.merchantId,
    kind: 'PAYMENT',
    externalReference: row.externalReference,
    gatewayId: row.gatewayPaymentId,
    amountCents: row.grossAmountCents,
    status: row.status
  };
}
function withdrawalOperation(row: WithdrawalEntity): LocalFinancialOperation {
  return {
    id: row.id,
    merchantId: row.merchantId,
    kind: 'WITHDRAWAL',
    externalReference: row.externalReference,
    gatewayId: row.gatewayWithdrawalId,
    amountCents: row.amountCents,
    status: row.status
  };
}
