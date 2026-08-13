import { Module } from '@nestjs/common';

import { LeraBoxFeesClient } from '../../integrations/lera-box/fees/lera-box-fees.client.js';
import { LeraBoxCardClient } from '../../integrations/lera-box/payments/lera-box-card.client.js';
import { LeraBoxPixClient } from '../../integrations/lera-box/payments/lera-box-pix.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { CheckoutLinkController } from '../checkout-links/checkout-link.controller.js';
import {
  CheckoutLinkService,
  createSha256TokenProtector
} from '../checkout-links/checkout-link.service.js';
import { TypeOrmCheckoutLinkStore } from '../checkout-links/typeorm-checkout-link.store.js';
import { EncryptionService } from '../gateway-accounts/encryption.service.js';
import { CheckoutSessionService } from '../public-checkout/checkout-session.service.js';
import { TypeOrmCheckoutSessionStore } from '../public-checkout/typeorm-checkout-session.store.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CardPaymentService } from './card/card-payment.service.js';
import { PaymentsController, CheckoutQuoteSigner } from './payments.controller.js';
import { PixPaymentService } from './pix/pix-payment.service.js';
import {
  TypeOrmCardAttemptStore,
  TypeOrmPixAttemptStore
} from './typeorm-payment-attempt.stores.js';

export const GATEWAY_FEES = Symbol('GATEWAY_FEES');
export const GATEWAY_PIX = Symbol('GATEWAY_PIX');
export const GATEWAY_CARD = Symbol('GATEWAY_CARD');

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [CheckoutLinkController, PaymentsController],
  providers: [
    TypeOrmCheckoutLinkStore,
    TypeOrmCheckoutSessionStore,
    TypeOrmPixAttemptStore,
    TypeOrmCardAttemptStore,
    {
      provide: GATEWAY_FEES,
      useFactory: () => new LeraBoxFeesClient(required('LERA_BOX_BASE_URL'))
    },
    { provide: GATEWAY_PIX, useFactory: () => new LeraBoxPixClient(required('LERA_BOX_BASE_URL')) },
    {
      provide: GATEWAY_CARD,
      useFactory: () => new LeraBoxCardClient(required('LERA_BOX_BASE_URL'))
    },
    {
      provide: CheckoutLinkService,
      inject: [TypeOrmCheckoutLinkStore, GATEWAY_FEES, EncryptionService],
      useFactory: (
        store: TypeOrmCheckoutLinkStore,
        fees: LeraBoxFeesClient,
        encryption: EncryptionService
      ) =>
        new CheckoutLinkService(
          store,
          fees,
          createSha256TokenProtector((token) =>
            encryption.encrypt(token, 'checkout-token', 'checkout-token', 'publicToken')
          )
        )
    },
    {
      provide: CheckoutSessionService,
      inject: [TypeOrmCheckoutSessionStore],
      useFactory: (store: TypeOrmCheckoutSessionStore) => new CheckoutSessionService(store)
    },
    {
      provide: PixPaymentService,
      inject: [GATEWAY_PIX, TypeOrmPixAttemptStore],
      useFactory: (gateway: LeraBoxPixClient, store: TypeOrmPixAttemptStore) =>
        new PixPaymentService(gateway, store)
    },
    {
      provide: CardPaymentService,
      inject: [GATEWAY_FEES, GATEWAY_CARD, TypeOrmCardAttemptStore],
      useFactory: (
        fees: LeraBoxFeesClient,
        gateway: LeraBoxCardClient,
        store: TypeOrmCardAttemptStore
      ) => new CardPaymentService(fees, gateway, store)
    },
    {
      provide: CheckoutQuoteSigner,
      useFactory: () => new CheckoutQuoteSigner(required('AUTH_TOKEN_SECRET'))
    }
  ]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class PaymentsModule {}

function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'AUTH_TOKEN_SECRET')
    return 'jest-auth-token-secret-at-least-32-bytes';
  if (process.env.JEST_WORKER_ID && name === 'LERA_BOX_BASE_URL') return 'https://gateway.invalid';
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
