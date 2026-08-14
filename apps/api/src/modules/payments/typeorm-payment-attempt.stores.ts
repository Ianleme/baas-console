import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { DatabaseService } from '../../database/database.service.js';
import { CheckoutLinkEntity } from '../checkout-links/entities/checkout-link.entity.js';
import { TransactionEntity } from '../transactions/entities/transaction.entity.js';
import type { CardAttempt, CardAttemptStore } from './card/card-payment.service.js';
import { PaymentAttemptEntity } from './entities/payment-attempt.entity.js';
import type { PixAttempt, PixAttemptStore } from './pix/pix-payment.service.js';

@Injectable()
export class TypeOrmPixAttemptStore implements PixAttemptStore {
  constructor(private readonly database: DatabaseService) {}

  async begin(
    input: Pick<PixAttempt, 'id' | 'merchantId' | 'checkoutLinkId' | 'externalReference'>
  ): Promise<PixAttempt> {
    const link = await this.database.getDataSource().manager.findOneByOrFail(CheckoutLinkEntity, {
      id: input.checkoutLinkId,
      merchantId: input.merchantId
    });
    await this.database.getDataSource().transaction(async (manager) => {
      await manager.insert(PaymentAttemptEntity, {
        ...input,
        method: 'PIX',
        status: 'PROCESSING',
        gatewayPaymentId: null,
        gatewayTransactionId: null,
        installments: 1,
        feeBps: 0,
        grossAmountCents: link.amountCents,
        feeAmountCents: '0',
        netAmountCents: link.amountCents,
        cardBrand: null,
        cardLast4: null,
        failureCode: null,
        pixTxid: null,
        pixEmv: null,
        pixQrCodeBase64: null,
        reconciliationAttempts: 0,
        nextReconciliationAt: null,
        leaseUntil: null
      });
      await manager.insert(TransactionEntity, {
        id: input.id,
        merchantId: input.merchantId,
        originType: 'PAYMENT',
        originId: input.id,
        externalReference: input.externalReference,
        gatewayTransactionId: null,
        type: 'CREDIT',
        status: 'PENDING',
        grossAmountCents: link.amountCents,
        feeAmountCents: '0',
        netAmountCents: link.amountCents,
        occurredAt: new Date(),
        projectionVersion: 1
      });
    });
    return {
      ...input,
      status: 'PROCESSING',
      gatewayPaymentId: null,
      txid: null,
      emv: null,
      qrCodeBase64: null,
      failureCode: null
    };
  }

  async transition(
    id: string,
    expected: PixAttempt['status'][],
    update: Partial<PixAttempt>
  ): Promise<PixAttempt> {
    await this.database.getDataSource().transaction(async (manager) => {
      const result = await manager.update(
        PaymentAttemptEntity,
        { id, status: In(expected) },
        {
          ...(update.status ? { status: update.status } : {}),
          ...(update.gatewayPaymentId !== undefined
            ? { gatewayPaymentId: update.gatewayPaymentId }
            : {}),
          ...(update.failureCode !== undefined ? { failureCode: update.failureCode } : {}),
          ...(update.txid !== undefined ? { pixTxid: update.txid } : {}),
          ...(update.emv !== undefined ? { pixEmv: update.emv } : {}),
          ...(update.qrCodeBase64 !== undefined ? { pixQrCodeBase64: update.qrCodeBase64 } : {})
        }
      );
      if (result.affected !== 1) throw new Error('PAYMENT_ATTEMPT_STATE_CONFLICT');
      await manager.update(
        TransactionEntity,
        {
          merchantId: (await manager.findOneByOrFail(PaymentAttemptEntity, { id })).merchantId,
          originType: 'PAYMENT',
          originId: id
        },
        {
          ...(update.status ? { status: transactionStatus(update.status) } : {}),
          ...(update.gatewayPaymentId !== undefined
            ? { gatewayTransactionId: update.gatewayPaymentId }
            : {})
        }
      );
    });
    return this.required(id);
  }

  async markLinkPaid(checkoutLinkId: string): Promise<void> {
    await this.database
      .getDataSource()
      .manager.update(
        CheckoutLinkEntity,
        { id: checkoutLinkId },
        { status: 'PAID', tokenClosedAt: new Date() }
      );
  }

  async required(id: string): Promise<PixAttempt> {
    const row = await this.database
      .getDataSource()
      .manager.findOneByOrFail(PaymentAttemptEntity, { id });
    return {
      id: row.id,
      merchantId: row.merchantId,
      checkoutLinkId: row.checkoutLinkId,
      externalReference: row.externalReference,
      status: row.status as PixAttempt['status'],
      gatewayPaymentId: row.gatewayPaymentId,
      txid: row.pixTxid,
      emv: row.pixEmv,
      qrCodeBase64: row.pixQrCodeBase64,
      failureCode: row.failureCode
    };
  }
}

@Injectable()
export class TypeOrmCardAttemptStore implements CardAttemptStore {
  constructor(private readonly database: DatabaseService) {}

  async countRecentDenials(
    merchantId: string,
    checkoutLinkId: string,
    since: Date
  ): Promise<number> {
    return this.database
      .getDataSource()
      .manager.createQueryBuilder(PaymentAttemptEntity, 'attempt')
      .where('attempt.merchant_id = :merchantId', { merchantId })
      .andWhere('attempt.checkout_link_id = :checkoutLinkId', { checkoutLinkId })
      .andWhere('attempt.status = :status', { status: 'DENIED' })
      .andWhere('attempt.created_at >= :since', { since })
      .getCount();
  }

  async begin(
    input: Omit<CardAttempt, 'status' | 'gatewayPaymentId' | 'failureCode'>
  ): Promise<CardAttempt> {
    await this.database.getDataSource().transaction(async (manager) => {
      await manager.insert(PaymentAttemptEntity, {
        ...input,
        method: 'CARD',
        status: 'PROCESSING',
        gatewayPaymentId: null,
        gatewayTransactionId: null,
        failureCode: null,
        pixTxid: null,
        pixEmv: null,
        pixQrCodeBase64: null,
        reconciliationAttempts: 0,
        nextReconciliationAt: null,
        leaseUntil: null
      });
      await manager.insert(TransactionEntity, {
        id: input.id,
        merchantId: input.merchantId,
        originType: 'PAYMENT',
        originId: input.id,
        externalReference: input.externalReference,
        gatewayTransactionId: null,
        type: 'CREDIT',
        status: 'PENDING',
        grossAmountCents: input.grossAmountCents,
        feeAmountCents: input.feeAmountCents,
        netAmountCents: input.netAmountCents,
        occurredAt: new Date(),
        projectionVersion: 1
      });
    });
    return { ...input, status: 'PROCESSING', gatewayPaymentId: null, failureCode: null };
  }

  async transition(
    id: string,
    expected: CardAttempt['status'][],
    update: Partial<CardAttempt>
  ): Promise<CardAttempt> {
    await this.database.getDataSource().transaction(async (manager) => {
      const result = await manager.update(
        PaymentAttemptEntity,
        { id, status: In(expected) },
        {
          ...(update.status ? { status: update.status } : {}),
          ...(update.gatewayPaymentId !== undefined
            ? { gatewayPaymentId: update.gatewayPaymentId }
            : {}),
          ...(update.failureCode !== undefined ? { failureCode: update.failureCode } : {})
        }
      );
      if (result.affected !== 1) throw new Error('PAYMENT_ATTEMPT_STATE_CONFLICT');
      const attempt = await manager.findOneByOrFail(PaymentAttemptEntity, { id });
      await manager.update(
        TransactionEntity,
        { merchantId: attempt.merchantId, originType: 'PAYMENT', originId: id },
        {
          ...(update.status ? { status: transactionStatus(update.status) } : {}),
          ...(update.gatewayPaymentId !== undefined
            ? { gatewayTransactionId: update.gatewayPaymentId }
            : {})
        }
      );
    });
    return this.required(id);
  }

  async markLinkPaid(checkoutLinkId: string): Promise<void> {
    await this.database
      .getDataSource()
      .manager.update(
        CheckoutLinkEntity,
        { id: checkoutLinkId },
        { status: 'PAID', tokenClosedAt: new Date() }
      );
  }

  private async required(id: string): Promise<CardAttempt> {
    const row = await this.database
      .getDataSource()
      .manager.findOneByOrFail(PaymentAttemptEntity, { id });
    return {
      id: row.id,
      merchantId: row.merchantId,
      checkoutLinkId: row.checkoutLinkId,
      externalReference: row.externalReference,
      status: row.status as CardAttempt['status'],
      gatewayPaymentId: row.gatewayPaymentId,
      installments: row.installments,
      feeBps: row.feeBps,
      grossAmountCents: row.grossAmountCents,
      feeAmountCents: row.feeAmountCents,
      netAmountCents: row.netAmountCents,
      cardBrand: row.cardBrand as CardAttempt['cardBrand'],
      cardLast4: row.cardLast4 ?? '',
      failureCode: row.failureCode
    };
  }
}

function transactionStatus(status: PixAttempt['status'] | CardAttempt['status']) {
  return status === 'PROCESSING' ? 'PENDING' : status;
}
