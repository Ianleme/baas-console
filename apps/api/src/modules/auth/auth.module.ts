import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { LeraBoxIdentityClient } from '../../integrations/lera-box/auth/lera-box-identity.client.js';
import { GatewayAccountController } from '../gateway-accounts/gateway-account.controller.js';
import { GATEWAY_IDENTITY } from '../gateway-accounts/gateway-accounts.module.js';
import { EncryptionService } from '../gateway-accounts/encryption.service.js';
import {
  GatewayOnboardingService,
  type GatewayIdentityPort
} from '../gateway-accounts/gateway-onboarding.service.js';
import { TypeOrmGatewayAccountStore } from '../gateway-accounts/typeorm-gateway-account.store.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TypeOrmAuthStore } from './typeorm-auth.store.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EmailDeliveriesController } from '../notifications/email-deliveries.controller.js';

@Module({
  imports: [NotificationsModule, DatabaseModule],
  controllers: [AuthController, GatewayAccountController, EmailDeliveriesController],
  providers: [
    TypeOrmAuthStore,
    TypeOrmGatewayAccountStore,
    {
      provide: GATEWAY_IDENTITY,
      useFactory: (): GatewayIdentityPort =>
        new LeraBoxIdentityClient(required('LERA_BOX_BASE_URL'))
    },
    {
      provide: EncryptionService,
      useFactory: () =>
        new EncryptionService(Buffer.from(required('ENCRYPTION_KEY_BASE64'), 'base64'))
    },
    {
      provide: GatewayOnboardingService,
      inject: [GATEWAY_IDENTITY, TypeOrmGatewayAccountStore, EncryptionService],
      useFactory: (
        gateway: GatewayIdentityPort,
        store: TypeOrmGatewayAccountStore,
        encryption: EncryptionService
      ) => new GatewayOnboardingService(gateway, store, encryption)
    },
    {
      provide: AuthService,
      inject: [TypeOrmAuthStore],
      useFactory: (store: TypeOrmAuthStore) =>
        new AuthService(store, undefined, required('AUTH_TOKEN_SECRET'))
    }
  ],
  exports: [AuthService, EncryptionService, TypeOrmAuthStore]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS requires a decorated runtime module class.
export class AuthModule {}
function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'AUTH_TOKEN_SECRET')
    return 'jest-auth-token-secret-at-least-32-bytes';
  if (process.env.JEST_WORKER_ID && name === 'LERA_BOX_BASE_URL') return 'https://gateway.invalid';
  if (process.env.JEST_WORKER_ID && name === 'ENCRYPTION_KEY_BASE64')
    return Buffer.alloc(32, 7).toString('base64');
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
