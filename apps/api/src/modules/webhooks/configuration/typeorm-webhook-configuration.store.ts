import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service.js';
import { AuditEventEntity } from '../../audit/entities/audit-event.entity.js';
import { WebhookEndpointEntity } from '../entities/webhook-endpoint.entity.js';
import type {
  WebhookConfigurationAudit,
  WebhookConfigurationRecord,
  WebhookConfigurationStore
} from './webhook-configuration.service.js';

@Injectable()
export class TypeOrmWebhookConfigurationStore implements WebhookConfigurationStore {
  constructor(private readonly database: DatabaseService) {}

  async find(merchantId: string, event: WebhookConfigurationRecord['eventType']) {
    const row = await this.database.getDataSource().manager.findOne(WebhookEndpointEntity, {
      where: { merchantId, eventType: event }
    });
    return row ? record(row) : undefined;
  }
  async list(merchantId: string) {
    return (
      await this.database.getDataSource().manager.find(WebhookEndpointEntity, {
        where: { merchantId },
        order: { configuredAt: 'ASC' }
      })
    ).map(record);
  }
  async replace(
    value: WebhookConfigurationRecord,
    audit: WebhookConfigurationAudit
  ): Promise<void> {
    await this.database.getDataSource().transaction(async (manager) => {
      await manager.save(
        manager.create(WebhookEndpointEntity, {
          ...value,
          gatewayWebhookId: value.gatewayWebhookId
        })
      );
      await manager.save(manager.create(AuditEventEntity, auditEntity(audit)));
    });
  }
  async remove(
    merchantId: string,
    event: WebhookConfigurationRecord['eventType'],
    audit: WebhookConfigurationAudit
  ) {
    return this.database.getDataSource().transaction(async (manager) => {
      const result = await manager.delete(WebhookEndpointEntity, { merchantId, eventType: event });
      if (result.affected !== 1) return false;
      await manager.save(manager.create(AuditEventEntity, auditEntity(audit)));
      return true;
    });
  }
}

function record(row: WebhookEndpointEntity): WebhookConfigurationRecord {
  return {
    id: row.id,
    merchantId: row.merchantId,
    publicEndpointId: row.publicEndpointId,
    eventType: row.eventType,
    gatewayWebhookId: row.gatewayWebhookId ?? '',
    secretCiphertext: row.secretCiphertext,
    status: row.status,
    configuredAt: row.configuredAt,
    lastReceivedAt: row.lastReceivedAt
  };
}
function auditEntity(audit: WebhookConfigurationAudit): Partial<AuditEventEntity> {
  return {
    id: audit.id,
    merchantId: audit.merchantId,
    actorUserId: audit.actorUserId,
    actorType: 'USER',
    action: audit.action,
    targetType: 'WEBHOOK_ENDPOINT',
    targetPublicId: audit.targetPublicId,
    requestId: audit.requestId,
    metadataJson: audit.metadata
  };
}
