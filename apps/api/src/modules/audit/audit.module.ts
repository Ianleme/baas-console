import { Module } from '@nestjs/common';
import { AuditRetentionService } from './audit-retention.service.js';
import { AuditEventService } from './audit-event.service.js';

@Module({
  providers: [AuditRetentionService, AuditEventService],
  exports: [AuditRetentionService, AuditEventService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuditModule {}
