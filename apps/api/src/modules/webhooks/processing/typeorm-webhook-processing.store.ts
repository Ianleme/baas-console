import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { DatabaseService } from '../../../database/database.service.js';
import { PaymentAttemptEntity } from '../../payments/entities/payment-attempt.entity.js';
import { WithdrawalEntity } from '../../withdrawals/entities/withdrawal.entity.js';
import { WebhookEndpointEntity } from '../entities/webhook-endpoint.entity.js';
import { WebhookEventEntity } from '../entities/webhook-event.entity.js';
import type {
  LeasedWebhookEvent,
  WebhookProcessingStore,
  WebhookProjectionResult
} from './webhook-processing.service.js';

@Injectable()
export class TypeOrmWebhookProcessingStore implements WebhookProcessingStore {
  constructor(private readonly database: DatabaseService) {}
  async acquire(limit: number, now: Date, leaseUntil: Date): Promise<LeasedWebhookEvent[]> {
    return this.database.getDataSource().transaction(async (manager) => {
      const events = await manager
        .createQueryBuilder(WebhookEventEntity, 'event')
        .innerJoinAndSelect('event.webhookEndpoint', 'endpoint')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where("event.status IN ('RECEIVED','RETRY_SCHEDULED')")
        .andWhere('(event.next_attempt_at IS NULL OR event.next_attempt_at <= :now)', { now })
        .andWhere('(event.lease_until IS NULL OR event.lease_until < :now)', { now })
        .orderBy('event.received_at', 'ASC')
        .limit(limit)
        .getMany();
      if (events.length)
        await manager.update(
          WebhookEventEntity,
          { id: In(events.map((event) => event.id)) },
          { status: 'PROCESSING', leaseUntil }
        );
      return events.map((event) => ({
        id: event.id,
        merchantId: event.merchantId,
        webhookEndpointId: event.webhookEndpointId,
        eventType: event.webhookEndpoint.eventType,
        rawBodyCiphertext: event.rawBodyCiphertext,
        attempts: event.attempts
      }));
    });
  }
  async finish(
    eventId: string,
    expected: 'PROCESSING',
    update: Parameters<WebhookProcessingStore['finish']>[2]
  ) {
    const result = await this.database
      .getDataSource()
      .manager.update(WebhookEventEntity, { id: eventId, status: expected }, update);
    return result.affected === 1;
  }
  async applyPayment(
    merchantId: string,
    gatewayId: string,
    expectedStatuses: string[],
    nextStatus: 'APPROVED' | 'DENIED'
  ): Promise<WebhookProjectionResult> {
    const current = await this.database.getDataSource().manager.findOne(PaymentAttemptEntity, {
      where: { merchantId, gatewayPaymentId: gatewayId }
    });
    if (!current) return { applied: false, currentStatus: 'NOT_FOUND' };
    const result = await this.database
      .getDataSource()
      .manager.update(
        PaymentAttemptEntity,
        { id: current.id, merchantId, status: In(expectedStatuses as never[]) },
        { status: nextStatus }
      );
    return {
      applied: result.affected === 1,
      currentStatus: result.affected === 1 ? nextStatus : current.status
    };
  }
  async applyWithdrawal(
    merchantId: string,
    gatewayId: string,
    expectedStatuses: string[],
    nextStatus: 'APPROVED' | 'DENIED'
  ): Promise<WebhookProjectionResult> {
    const current = await this.database
      .getDataSource()
      .manager.findOne(WithdrawalEntity, { where: { merchantId, gatewayWithdrawalId: gatewayId } });
    if (!current) return { applied: false, currentStatus: 'NOT_FOUND' };
    const result = await this.database
      .getDataSource()
      .manager.update(
        WithdrawalEntity,
        { id: current.id, merchantId, status: In(expectedStatuses as never[]) },
        { status: nextStatus }
      );
    return {
      applied: result.affected === 1,
      currentStatus: result.affected === 1 ? nextStatus : current.status
    };
  }
}
