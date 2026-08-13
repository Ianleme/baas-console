import { Module } from '@nestjs/common';
import { AuditRetentionService } from './audit-retention.service.js';

@Module({
  providers: [AuditRetentionService],
  exports: [AuditRetentionService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuditModule {}
