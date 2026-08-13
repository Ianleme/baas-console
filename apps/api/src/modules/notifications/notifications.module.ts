import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { EncryptionService } from '../gateway-accounts/encryption.service.js';
import { EmailDeliveryEntity } from './entities/email-delivery.entity.js';
import { EmailOutboxService } from './email-outbox.service.js';
import { SmtpEmailGateway } from './smtp-email.gateway.js';

export const EMAIL_GATEWAY = Symbol('EMAIL_GATEWAY');

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: EMAIL_GATEWAY,
      useFactory: () => new SmtpEmailGateway()
    },
    {
      provide: EmailOutboxService,
      inject: [DatabaseService, EncryptionService, EMAIL_GATEWAY],
      useFactory: (
        database: DatabaseService,
        encryption: EncryptionService,
        gateway: SmtpEmailGateway
      ) =>
        new EmailOutboxService(
          database.getDataSource().getRepository(EmailDeliveryEntity),
          encryption,
          gateway
        )
    }
  ],
  exports: [EmailOutboxService, EMAIL_GATEWAY]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class NotificationsModule {}
