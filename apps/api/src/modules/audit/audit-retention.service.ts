import { Injectable, Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { DatabaseService } from '../../database/database.service.js';
import { EmailDeliveryEntity } from '../notifications/entities/email-delivery.entity.js';
import { AuditEventEntity } from './entities/audit-event.entity.js';

export interface RetentionPolicyConfig {
  outboxRetentionDays: number;
  auditRetentionYears: number;
  operationalAuditRetentionDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicyConfig = {
  outboxRetentionDays: 30,
  auditRetentionYears: 5,
  operationalAuditRetentionDays: 90
};

export function calculateCutoffDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function calculateYearsCutoffDate(now: Date, years: number): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(private readonly database: DatabaseService) {}

  private get dataSource(): DataSource {
    const db = this.database as unknown as { getDataSource?: () => DataSource };
    if (typeof db.getDataSource === 'function') {
      return db.getDataSource();
    }
    return this.database as unknown as DataSource;
  }

  async purgeOutbox(now = new Date()): Promise<{ purged: number; cutoff: string }> {
    const cutoff = now.toISOString();
    const result = await this.dataSource
      .getRepository(EmailDeliveryEntity)
      .createQueryBuilder()
      .delete()
      .from(EmailDeliveryEntity)
      .where('purgeAfter IS NOT NULL AND purgeAfter <= :now', { now })
      .execute();

    const purged = result.affected ?? 0;
    this.logger.log(
      `Outbox purge completed: ${String(purged)} records deleted prior to cutoff ${cutoff}`
    );
    return { purged, cutoff };
  }

  async purgeExpiredAuditEvents(
    options: {
      now?: Date;
      auditRetentionYears?: number;
      operationalRetentionDays?: number;
    } = {}
  ): Promise<{ purgedFinancial: number; purgedOperational: number }> {
    const now = options.now ?? new Date();
    const financialYears =
      options.auditRetentionYears ?? DEFAULT_RETENTION_POLICY.auditRetentionYears;
    const operationalDays =
      options.operationalRetentionDays ?? DEFAULT_RETENTION_POLICY.operationalAuditRetentionDays;

    const financialCutoff = calculateYearsCutoffDate(now, financialYears);
    const operationalCutoff = calculateCutoffDate(now, operationalDays);

    const auditRepo = this.dataSource.getRepository(AuditEventEntity);

    // Purge operational non-financial audit events older than operational Cutoff
    const opResult = await auditRepo
      .createQueryBuilder()
      .delete()
      .from(AuditEventEntity)
      .where('createdAt <= :operationalCutoff', { operationalCutoff })
      .andWhere('action NOT IN (:...financialActions)', {
        financialActions: [
          'PAYMENT_STARTED',
          'PAYMENT_APPROVED',
          'PAYMENT_DENIED',
          'WITHDRAWAL_REQUESTED',
          'WITHDRAWAL_APPROVED',
          'WITHDRAWAL_REJECTED'
        ]
      })
      .execute();

    // Purge financial audit events older than financial 5-year Cutoff
    const finResult = await auditRepo
      .createQueryBuilder()
      .delete()
      .from(AuditEventEntity)
      .where('createdAt <= :financialCutoff', { financialCutoff })
      .andWhere('action IN (:...financialActions)', {
        financialActions: [
          'PAYMENT_STARTED',
          'PAYMENT_APPROVED',
          'PAYMENT_DENIED',
          'WITHDRAWAL_REQUESTED',
          'WITHDRAWAL_APPROVED',
          'WITHDRAWAL_REJECTED'
        ]
      })
      .execute();

    const purgedOperational = opResult.affected ?? 0;
    const purgedFinancial = finResult.affected ?? 0;

    this.logger.log(
      `Audit retention purge executed: ${String(purgedOperational)} operational events, ${String(purgedFinancial)} financial events purged`
    );

    return { purgedFinancial, purgedOperational };
  }

  async runFullPurgeCycle(now = new Date()): Promise<{
    outboxPurged: number;
    financialAuditPurged: number;
    operationalAuditPurged: number;
  }> {
    const { purged: outboxPurged } = await this.purgeOutbox(now);
    const { purgedFinancial, purgedOperational } = await this.purgeExpiredAuditEvents({ now });

    return {
      outboxPurged,
      financialAuditPurged: purgedFinancial,
      operationalAuditPurged: purgedOperational
    };
  }
}
