import {
  AuditRetentionService,
  calculateCutoffDate,
  calculateYearsCutoffDate,
  DEFAULT_RETENTION_POLICY
} from '../../src/modules/audit/audit-retention.service.js';
import type { DataSource } from 'typeorm';

interface MockQueryBuilder {
  delete: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  execute: jest.Mock;
}

describe('AuditRetentionService', () => {
  let mockDataSource: DataSource;
  let mockQueryBuilder: MockQueryBuilder;
  let mockRepository: { createQueryBuilder: jest.Mock };
  let service: AuditRetentionService;

  beforeEach(() => {
    mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 5 })
    };

    mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder)
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository)
    } as unknown as DataSource;

    service = new AuditRetentionService(mockDataSource);
  });

  describe('Cutoff Date Helpers', () => {
    it('calculates cutoff date X days in the past', () => {
      const now = new Date('2026-08-12T12:00:00.000Z');
      const cutoff = calculateCutoffDate(now, 30);
      expect(cutoff.toISOString()).toBe('2026-07-13T12:00:00.000Z');
    });

    it('calculates cutoff date X years in the past', () => {
      const now = new Date('2026-08-12T12:00:00.000Z');
      const cutoff = calculateYearsCutoffDate(now, 5);
      expect(cutoff.getUTCFullYear()).toBe(2021);
      expect(cutoff.getUTCMonth()).toBe(7); // August (0-indexed 7)
    });

    it('exposes default retention policy values', () => {
      expect(DEFAULT_RETENTION_POLICY.outboxRetentionDays).toBe(30);
      expect(DEFAULT_RETENTION_POLICY.auditRetentionYears).toBe(5);
      expect(DEFAULT_RETENTION_POLICY.operationalAuditRetentionDays).toBe(90);
    });
  });

  describe('purgeOutbox', () => {
    it('deletes expired outbox records prior to current date', async () => {
      const now = new Date('2026-08-12T00:00:00.000Z');
      const result = await service.purgeOutbox(now);

      expect(result.purged).toBe(5);
      expect(result.cutoff).toBe(now.toISOString());
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'purgeAfter IS NOT NULL AND purgeAfter <= :now',
        { now }
      );
    });
  });

  describe('purgeExpiredAuditEvents', () => {
    it('purges operational and financial audit events with default thresholds', async () => {
      const now = new Date('2026-08-12T00:00:00.000Z');
      const result = await service.purgeExpiredAuditEvents({ now });

      expect(result.purgedOperational).toBe(5);
      expect(result.purgedFinancial).toBe(5);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('supports custom override thresholds for retention years and operational days', async () => {
      const now = new Date('2026-08-12T00:00:00.000Z');
      await service.purgeExpiredAuditEvents({
        now,
        auditRetentionYears: 7,
        operationalRetentionDays: 60
      });

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
    });
  });

  describe('runFullPurgeCycle', () => {
    it('runs outbox purge and audit event purge in a single atomic cycle', async () => {
      const now = new Date('2026-08-12T00:00:00.000Z');
      const res = await service.runFullPurgeCycle(now);

      expect(res.outboxPurged).toBe(5);
      expect(res.financialAuditPurged).toBe(5);
      expect(res.operationalAuditPurged).toBe(5);
    });
  });
});
