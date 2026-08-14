import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { EncryptionService } from '../gateway-accounts/encryption.service.js';
import { EmailOutboxService } from './email-outbox.service.js';
import { BrevoEmailGateway } from './brevo-email.gateway.js';
import { OutboxWorker } from './outbox.worker.js';
import { EMAIL_GATEWAY } from './email-gateway.token.js';

@Module({
  imports: [DatabaseModule],
  controllers: [],
  providers: [
    {
      provide: EncryptionService,
      useFactory: () =>
        new EncryptionService(Buffer.from(required('ENCRYPTION_KEY_BASE64'), 'base64'))
    },
    {
      provide: EMAIL_GATEWAY,
      useFactory: () => new BrevoEmailGateway()
    },
    {
      provide: EmailOutboxService,
      inject: [DatabaseService, EncryptionService, EMAIL_GATEWAY],
      useFactory: (
        database: DatabaseService,
        encryption: EncryptionService,
        gateway: BrevoEmailGateway
      ) => new EmailOutboxService(database, encryption, gateway)
    },
    OutboxWorker
  ],
  exports: [EmailOutboxService, EMAIL_GATEWAY]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class NotificationsModule {}

function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'ENCRYPTION_KEY_BASE64')
    return Buffer.alloc(32, 7).toString('base64');
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
