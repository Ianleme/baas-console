import { Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../../database/database.service.js';
import { AuditEventEntity } from './entities/audit-event.entity.js';

const ALLOWED_ACTIONS = new Set([
  'LOGIN',
  'GATEWAY_CONNECTED',
  'CHECKOUT_CREATED',
  'PAYMENT_SUBMITTED',
  'WITHDRAWAL_SUBMITTED',
  'WEBHOOK_CONFIGURED',
  'RECEIPT_ISSUED',
  'DEMO_SESSION_ISSUED'
]);

export interface AuditEventInput {
  merchantId: string;
  actorUserId?: string | null;
  actorType: 'USER' | 'SYSTEM' | 'DEMO';
  action: string;
  targetType: string;
  targetPublicId?: string | null;
  requestId: string;
  metadata?: Record<string, string | number | boolean>;
}

@Injectable()
export class AuditEventService {
  constructor(private readonly database: DatabaseService) {}

  private get dataSource(): DataSource {
    return this.database.getDataSource();
  }

  async record(input: AuditEventInput): Promise<void> {
    if (!ALLOWED_ACTIONS.has(input.action)) throw new Error('AUDIT_ACTION_NOT_ALLOWED');
    await this.dataSource.getRepository(AuditEventEntity).insert({
      id: randomUUID(),
      merchantId: input.merchantId,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      targetType: input.targetType,
      targetPublicId: input.targetPublicId ?? null,
      requestId: input.requestId,
      metadataJson: input.metadata ?? {}
    });
  }
}

export function isAllowedAuditAction(action: string): boolean {
  return ALLOWED_ACTIONS.has(action);
}
