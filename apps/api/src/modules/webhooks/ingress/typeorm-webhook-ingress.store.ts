import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service.js';
import { WebhookEndpointEntity } from '../entities/webhook-endpoint.entity.js';
import { WebhookEventEntity } from '../entities/webhook-event.entity.js';
import type {
  IngressEndpoint,
  IngressEvent,
  WebhookIngressStore
} from './webhook-ingress.service.js';

@Injectable()
export class TypeOrmWebhookIngressStore implements WebhookIngressStore {
  constructor(private readonly database: DatabaseService) {}
  async findActiveEndpoint(publicEndpointId: string): Promise<IngressEndpoint | undefined> {
    const row = await this.database.getDataSource().manager.findOne(WebhookEndpointEntity, {
      where: { publicEndpointId, status: 'ACTIVE' }
    });
    return row
      ? {
          id: row.id,
          merchantId: row.merchantId,
          publicEndpointId: row.publicEndpointId,
          eventType: row.eventType,
          secretCiphertext: row.secretCiphertext,
          status: row.status
        }
      : undefined;
  }
  async insert(event: IngressEvent): Promise<void> {
    try {
      await this.database.getDataSource().manager.insert(WebhookEventEntity, {
        ...event,
        attempts: 0,
        leaseUntil: null,
        lastErrorCode: null,
        processedAt: null
      });
      await this.database
        .getDataSource()
        .manager.update(
          WebhookEndpointEntity,
          { id: event.webhookEndpointId, merchantId: event.merchantId },
          { lastReceivedAt: event.receivedAt }
        );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ER_DUP_ENTRY'
      )
        return;
      throw error;
    }
  }
}
