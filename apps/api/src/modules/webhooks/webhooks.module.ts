import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';

import { LeraBoxReconciliationClient } from '../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';
import { LeraBoxWebhooksClient } from '../../integrations/lera-box/webhooks/lera-box-webhooks.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import { ReconciliationController } from '../reconciliation/reconciliation.controller.js';
import {
  BearerReconciliationPrincipal,
  RuntimeReconciliationService
} from '../reconciliation/runtime-reconciliation.providers.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import { TypeOrmReconciliationQuery } from '../reconciliation/typeorm-reconciliation.query.js';
import { TypeOrmReconciliationStore } from '../reconciliation/typeorm-reconciliation.store.js';
import { WebhookConfigurationController } from './configuration/webhook-configuration.controller.js';
import { WebhookConfigurationService } from './configuration/webhook-configuration.service.js';
import { TypeOrmWebhookConfigurationStore } from './configuration/typeorm-webhook-configuration.store.js';
import { WebhookIngressController } from './ingress/webhook-ingress.controller.js';
import { WebhookIngressService } from './ingress/webhook-ingress.service.js';
import { TypeOrmWebhookIngressStore } from './ingress/typeorm-webhook-ingress.store.js';
import { WebhookProcessingService } from './processing/webhook-processing.service.js';
import { TypeOrmWebhookProcessingStore } from './processing/typeorm-webhook-processing.store.js';
import { WebhookWorker } from './processing/webhook-worker.js';
import { EncryptionService } from '../gateway-accounts/encryption.service.js';

export const GATEWAY_WEBHOOKS = Symbol('GATEWAY_WEBHOOKS');
export const GATEWAY_RECONCILIATION = Symbol('GATEWAY_RECONCILIATION');

@Module({
  imports: [AuthModule],
  controllers: [WebhookConfigurationController, WebhookIngressController, ReconciliationController],
  providers: [
    GatewayCredentialService,
    TypeOrmWebhookConfigurationStore,
    TypeOrmWebhookIngressStore,
    TypeOrmWebhookProcessingStore,
    TypeOrmReconciliationStore,
    TypeOrmReconciliationQuery,
    WebhookWorker,
    {
      provide: GATEWAY_WEBHOOKS,
      useFactory: () => new LeraBoxWebhooksClient(required('LERA_BOX_BASE_URL'))
    },
    {
      provide: GATEWAY_RECONCILIATION,
      useFactory: () => new LeraBoxReconciliationClient(required('LERA_BOX_BASE_URL'))
    },
    {
      provide: WebhookConfigurationService,
      inject: [GATEWAY_WEBHOOKS, TypeOrmWebhookConfigurationStore, EncryptionService],
      useFactory: (
        gateway: LeraBoxWebhooksClient,
        store: TypeOrmWebhookConfigurationStore,
        encryption: EncryptionService
      ) =>
        new WebhookConfigurationService(
          gateway,
          store,
          encryption,
          required('PUBLIC_API_BASE_URL'),
          undefined,
          undefined,
          () => randomBytes(16).toString('hex')
        )
    },
    {
      provide: WebhookIngressService,
      inject: [TypeOrmWebhookIngressStore, EncryptionService],
      useFactory: (store: TypeOrmWebhookIngressStore, encryption: EncryptionService) =>
        new WebhookIngressService(store, encryption)
    },
    {
      provide: WebhookProcessingService,
      inject: [TypeOrmWebhookProcessingStore, EncryptionService],
      useFactory: (store: TypeOrmWebhookProcessingStore, encryption: EncryptionService) =>
        new WebhookProcessingService(store, encryption)
    },
    {
      provide: ReconciliationService,
      inject: [GATEWAY_RECONCILIATION, TypeOrmReconciliationStore, GatewayCredentialService],
      useFactory: (
        gateway: LeraBoxReconciliationClient,
        store: TypeOrmReconciliationStore,
        credentials: GatewayCredentialService
      ) => new RuntimeReconciliationService(gateway, store, credentials)
    },
    { provide: 'ReconciliationQuery', useExisting: TypeOrmReconciliationQuery },
    { provide: 'ReconciliationPrincipalProvider', useClass: BearerReconciliationPrincipal }
  ]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class WebhooksModule {}

function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'PUBLIC_API_BASE_URL')
    return 'https://api.example.test';
  if (process.env.JEST_WORKER_ID && name === 'LERA_BOX_BASE_URL') return 'https://gateway.invalid';
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
