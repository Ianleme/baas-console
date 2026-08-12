import { DataSource } from 'typeorm';

import { CreateAsyncPersistence1723503000000 } from '../migrations/1723503000000-CreateAsyncPersistence.js';
import { CreateAuthPersistence1723500000000 } from '../migrations/1723500000000-CreateAuthPersistence.js';
import { CreatePaymentPersistence1723501000000 } from '../migrations/1723501000000-CreatePaymentPersistence.js';
import { CreateWalletWithdrawalPersistence1723502000000 } from '../migrations/1723502000000-CreateWalletWithdrawalPersistence.js';
import { AuditEventEntity } from '../modules/audit/entities/index.js';
import {
  AuthSessionEntity,
  GatewayAccountEntity,
  MerchantEntity,
  UserEntity
} from '../modules/auth/entities/index.js';
import { CheckoutLinkEntity } from '../modules/checkout-links/entities/index.js';
import { EmailDeliveryEntity } from '../modules/notifications/entities/index.js';
import { PaymentAttemptEntity } from '../modules/payments/entities/index.js';
import { FinancialEventEntity, TransactionEntity } from '../modules/transactions/entities/index.js';
import { WalletSnapshotEntity } from '../modules/wallet/entities/index.js';
import { WebhookEndpointEntity, WebhookEventEntity } from '../modules/webhooks/entities/index.js';
import { WithdrawalEntity } from '../modules/withdrawals/entities/index.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`DATABASE_ENV_MISSING: ${name}`);
  return value;
}

export function createApplicationDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: requiredEnvironment('DATABASE_HOST'),
    port: Number(process.env.DATABASE_PORT ?? 3306),
    username: requiredEnvironment('DATABASE_USER'),
    password: requiredEnvironment('DATABASE_PASSWORD'),
    database: requiredEnvironment('DATABASE_NAME'),
    charset: 'utf8mb4',
    entities: [
      MerchantEntity,
      UserEntity,
      AuthSessionEntity,
      GatewayAccountEntity,
      CheckoutLinkEntity,
      PaymentAttemptEntity,
      TransactionEntity,
      FinancialEventEntity,
      WalletSnapshotEntity,
      WithdrawalEntity,
      WebhookEndpointEntity,
      WebhookEventEntity,
      EmailDeliveryEntity,
      AuditEventEntity
    ],
    migrations: [
      CreateAuthPersistence1723500000000,
      CreatePaymentPersistence1723501000000,
      CreateWalletWithdrawalPersistence1723502000000,
      CreateAsyncPersistence1723503000000
    ],
    migrationsRun: false,
    migrationsTableName: 'migrations',
    synchronize: false
  });
}
