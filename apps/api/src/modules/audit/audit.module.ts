import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditRetentionService } from './audit-retention.service.js';
import { AuditEventService } from './audit-event.service.js';

@Module({
  imports: [AuthModule],
  providers: [AuditRetentionService, AuditEventService],
  exports: [AuditRetentionService, AuditEventService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuditModule {}
