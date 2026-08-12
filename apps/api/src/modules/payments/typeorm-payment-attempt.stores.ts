import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { DatabaseService } from '../../database/database.service.js';
import { CheckoutLinkEntity } from '../checkout-links/entities/checkout-link.entity.js';
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
    await this.database.getDataSource().manager.insert(PaymentAttemptEntity, {
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
    const result = await this.database.getDataSource().manager.update(
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
    await this.database.getDataSource().manager.insert(PaymentAttemptEntity, {
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
    return { ...input, status: 'PROCESSING', gatewayPaymentId: null, failureCode: null };
  }

  async transition(
    id: string,
    expected: CardAttempt['status'][],
    update: Partial<CardAttempt>
  ): Promise<CardAttempt> {
    const result = await this.database.getDataSource().manager.update(
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
