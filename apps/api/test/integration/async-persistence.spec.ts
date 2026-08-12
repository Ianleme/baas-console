import { randomUUID } from 'node:crypto';
import { DataSource, type QueryFailedError } from 'typeorm';

import { AuditEventEntity } from '../../src/modules/audit/entities/index.js';
import {
  AuthSessionEntity,
  GatewayAccountEntity,
  MerchantEntity,
  UserEntity
} from '../../src/modules/auth/entities/index.js';
import { CheckoutLinkEntity } from '../../src/modules/checkout-links/entities/index.js';
import { EmailDeliveryEntity } from '../../src/modules/notifications/entities/index.js';
import { PaymentAttemptEntity } from '../../src/modules/payments/entities/index.js';
import {
  FinancialEventEntity,
  TransactionEntity
} from '../../src/modules/transactions/entities/index.js';
import { WalletSnapshotEntity } from '../../src/modules/wallet/entities/index.js';
import {
  WebhookEndpointEntity,
  WebhookEventEntity
} from '../../src/modules/webhooks/entities/index.js';
import { WithdrawalEntity } from '../../src/modules/withdrawals/entities/index.js';
import { CreateAsyncPersistence1723503000000 } from '../../src/migrations/1723503000000-CreateAsyncPersistence.js';
import { CreateAuthPersistence1723500000000 } from '../../src/migrations/1723500000000-CreateAuthPersistence.js';
import { CreatePaymentPersistence1723501000000 } from '../../src/migrations/1723501000000-CreatePaymentPersistence.js';
import { CreateWalletWithdrawalPersistence1723502000000 } from '../../src/migrations/1723502000000-CreateWalletWithdrawalPersistence.js';

const databaseName = process.env.MYSQL_TEST_DATABASE ?? 'baas_test';

function createDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_TEST_PORT ?? '33078'),
    username: process.env.MYSQL_TEST_USER ?? 'baas',
    password: process.env.MYSQL_TEST_PASSWORD ?? 'baas-test-password',
    database: databaseName,
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
    synchronize: false
  });
}

async function expectConstraintViolation(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject<QueryFailedError>({ name: 'QueryFailedError' });
}

describe('asynchronous processing persistence on MySQL 8.4', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    if (databaseName !== 'baas_test') throw new Error('UNSAFE_TEST_DATABASE_NAME');
    dataSource = createDataSource();
    await dataSource.initialize();
    await dataSource.dropDatabase();
    await dataSource.runMigrations({ transaction: 'all' });
  });

  afterAll(async () => dataSource.destroy());

  beforeEach(async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of [
        'audit_events',
        'email_deliveries',
        'webhook_events',
        'webhook_endpoints',
        'financial_events',
        'wallet_snapshots',
        'withdrawals',
        'transactions',
        'payment_attempts',
        'checkout_links',
        'gateway_accounts',
        'auth_sessions',
        'users',
        'merchants'
      ]) {
        await queryRunner.query(`DELETE FROM \`${table}\``);
      }
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      await queryRunner.release();
    }
  });

  async function insertMerchant(id = randomUUID()): Promise<string> {
    await dataSource.query(
      'INSERT INTO merchants (id, legal_name, display_name, status, demo_mode) VALUES (?, ?, ?, ?, ?)',
      [id, `Legal ${id}`, `Display ${id}`, 'ACTIVE', false]
    );
    return id;
  }

  async function insertEndpoint(
    merchantId: string,
    overrides: Record<string, unknown> = {}
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO webhook_endpoints (id, merchant_id, public_endpoint_id, event_type, gateway_webhook_id, secret_ciphertext, status, configured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        merchantId,
        overrides.publicEndpointId ?? randomUUID().replaceAll('-', ''),
        overrides.eventType ?? 'PAYMENT_PIX',
        overrides.gatewayWebhookId ?? null,
        Buffer.from('encrypted-secret'),
        'ACTIVE',
        new Date()
      ]
    );
    return id;
  }

  async function insertWebhookEvent(
    endpointId: string,
    merchantId: string,
    dedupeKey: string
  ): Promise<unknown> {
    return dataSource.query<unknown>(
      'INSERT INTO webhook_events (id, merchant_id, webhook_endpoint_id, dedupe_key, raw_body_ciphertext, raw_body_hash, signature_metadata, status, next_attempt_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        merchantId,
        endpointId,
        dedupeKey,
        Buffer.from('encrypted-body'),
        Buffer.alloc(32, 1),
        JSON.stringify({ encoding: 'pending-contract-spike' }),
        'RECEIVED',
        new Date(Date.now() - 1_000),
        new Date(Date.now() + 90 * 86_400_000)
      ]
    );
  }

  async function insertEmail(merchantId: string, idempotencyKey: string): Promise<unknown> {
    return dataSource.query<unknown>(
      'INSERT INTO email_deliveries (id, merchant_id, kind, idempotency_key, recipient_ciphertext, recipient_masked, template_version, payload_ciphertext, status, next_attempt_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        merchantId,
        'CHECKOUT_LINK',
        idempotencyKey,
        Buffer.from('encrypted-recipient'),
        'o***@example.test',
        1,
        Buffer.from('encrypted-payload'),
        'QUEUED',
        new Date(Date.now() - 1_000),
        new Date(Date.now() + 30 * 86_400_000)
      ]
    );
  }

  test('creates webhook, e-mail and audit tables', async () => {
    const tables = await dataSource.query<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('webhook_endpoints', 'webhook_events', 'email_deliveries', 'audit_events')",
      [databaseName]
    );
    expect(tables.map(({ TABLE_NAME }) => TABLE_NAME).sort()).toEqual([
      'audit_events',
      'email_deliveries',
      'webhook_endpoints',
      'webhook_events'
    ]);
  });

  test('enforces one webhook endpoint per merchant and event', async () => {
    const merchantId = await insertMerchant();
    await insertEndpoint(merchantId, { eventType: 'PAYMENT_PIX' });
    await expectConstraintViolation(insertEndpoint(merchantId, { eventType: 'PAYMENT_PIX' }));
  });

  test('allows the same webhook event type in isolated tenants', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    await expect(insertEndpoint(firstMerchant)).resolves.toBeDefined();
    await expect(insertEndpoint(secondMerchant)).resolves.toBeDefined();
  });

  test('enforces globally opaque webhook endpoint identifiers', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    await insertEndpoint(firstMerchant, { publicEndpointId: 'opaque-id' });
    await expectConstraintViolation(
      insertEndpoint(secondMerchant, { publicEndpointId: 'opaque-id' })
    );
  });

  test('stores webhook secrets and raw bodies only as binary ciphertext', async () => {
    const columns = await dataSource.query<
      { TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string }[]
    >(
      "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND ((TABLE_NAME = 'webhook_endpoints' AND COLUMN_NAME = 'secret_ciphertext') OR (TABLE_NAME = 'webhook_events' AND COLUMN_NAME = 'raw_body_ciphertext')) ORDER BY TABLE_NAME",
      [databaseName]
    );
    expect(columns).toEqual([
      { TABLE_NAME: 'webhook_endpoints', COLUMN_NAME: 'secret_ciphertext', DATA_TYPE: 'varbinary' },
      { TABLE_NAME: 'webhook_events', COLUMN_NAME: 'raw_body_ciphertext', DATA_TYPE: 'longblob' }
    ]);
  });

  test('deduplicates webhook events within an endpoint', async () => {
    const merchantId = await insertMerchant();
    const endpointId = await insertEndpoint(merchantId);
    await insertWebhookEvent(endpointId, merchantId, 'same-event');
    await expectConstraintViolation(insertWebhookEvent(endpointId, merchantId, 'same-event'));
  });

  test('rejects a webhook event that crosses tenant boundaries', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    const endpointId = await insertEndpoint(firstMerchant);
    await expectConstraintViolation(insertWebhookEvent(endpointId, secondMerchant, 'event-1'));
  });

  test('constrains webhook processing states including terminal review outcomes', async () => {
    const rows = await dataSource.query<{ COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'webhook_events' AND COLUMN_NAME = 'status'",
      [databaseName]
    );
    expect(rows[0]?.COLUMN_TYPE).toBe(
      "enum('RECEIVED','PROCESSING','RETRY_SCHEDULED','PROCESSED','UNPROCESSABLE','DEAD_LETTER')"
    );
  });

  test('atomically leases a webhook event to only one competing worker', async () => {
    const merchantId = await insertMerchant();
    const endpointId = await insertEndpoint(merchantId);
    await insertWebhookEvent(endpointId, merchantId, 'lease-event');
    const leaseUntil = new Date(Date.now() + 60_000);
    const acquire = () =>
      dataSource.query<{ affectedRows: number }>(
        "UPDATE webhook_events SET status = 'PROCESSING', lease_until = ? WHERE webhook_endpoint_id = ? AND dedupe_key = ? AND status IN ('RECEIVED', 'RETRY_SCHEDULED') AND (lease_until IS NULL OR lease_until < NOW(6))",
        [leaseUntil, endpointId, 'lease-event']
      );
    const results = await Promise.all([acquire(), acquire()]);
    expect(results.map(({ affectedRows }) => affectedRows).sort()).toEqual([0, 1]);
  });

  test('recovers a processing webhook after its lease expires', async () => {
    const merchantId = await insertMerchant();
    const endpointId = await insertEndpoint(merchantId);
    await insertWebhookEvent(endpointId, merchantId, 'expired-lease');
    await dataSource.query(
      "UPDATE webhook_events SET status = 'PROCESSING', lease_until = DATE_SUB(NOW(6), INTERVAL 1 SECOND) WHERE webhook_endpoint_id = ?",
      [endpointId]
    );
    const result = await dataSource.query<{ affectedRows: number }>(
      "UPDATE webhook_events SET lease_until = DATE_ADD(NOW(6), INTERVAL 1 MINUTE) WHERE webhook_endpoint_id = ? AND status = 'PROCESSING' AND lease_until < NOW(6)",
      [endpointId]
    );
    expect(result.affectedRows).toBe(1);
  });

  test('acquires a scheduled retry only after its due time', async () => {
    const merchantId = await insertMerchant();
    const endpointId = await insertEndpoint(merchantId);
    await insertWebhookEvent(endpointId, merchantId, 'future-retry');
    await dataSource.query(
      "UPDATE webhook_events SET status = 'RETRY_SCHEDULED', next_attempt_at = DATE_ADD(NOW(6), INTERVAL 1 HOUR) WHERE webhook_endpoint_id = ?",
      [endpointId]
    );
    const early = await dataSource.query<{ affectedRows: number }>(
      "UPDATE webhook_events SET status = 'PROCESSING' WHERE webhook_endpoint_id = ? AND status = 'RETRY_SCHEDULED' AND next_attempt_at <= NOW(6)",
      [endpointId]
    );
    expect(early.affectedRows).toBe(0);
    await dataSource.query(
      'UPDATE webhook_events SET next_attempt_at = DATE_SUB(NOW(6), INTERVAL 1 SECOND) WHERE webhook_endpoint_id = ?',
      [endpointId]
    );
    const due = await dataSource.query<{ affectedRows: number }>(
      "UPDATE webhook_events SET status = 'PROCESSING' WHERE webhook_endpoint_id = ? AND status = 'RETRY_SCHEDULED' AND next_attempt_at <= NOW(6)",
      [endpointId]
    );
    expect(due.affectedRows).toBe(1);
  });

  test('never reacquires a dead-letter webhook', async () => {
    const merchantId = await insertMerchant();
    const endpointId = await insertEndpoint(merchantId);
    await insertWebhookEvent(endpointId, merchantId, 'dead-letter');
    await dataSource.query(
      "UPDATE webhook_events SET status = 'DEAD_LETTER', next_attempt_at = DATE_SUB(NOW(6), INTERVAL 1 SECOND) WHERE webhook_endpoint_id = ?",
      [endpointId]
    );
    const result = await dataSource.query<{ affectedRows: number }>(
      "UPDATE webhook_events SET status = 'PROCESSING' WHERE webhook_endpoint_id = ? AND status IN ('RECEIVED', 'RETRY_SCHEDULED') AND next_attempt_at <= NOW(6)",
      [endpointId]
    );
    expect(result.affectedRows).toBe(0);
  });

  test('represents webhook retry and encrypted-body retention indexes', async () => {
    const indexes = await dataSource.query<{ INDEX_NAME: string }[]>(
      "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'webhook_events' AND INDEX_NAME IN ('idx_webhook_events_lease', 'idx_webhook_events_purge') ORDER BY INDEX_NAME",
      [databaseName]
    );
    expect(indexes).toEqual([
      { INDEX_NAME: 'idx_webhook_events_lease' },
      { INDEX_NAME: 'idx_webhook_events_purge' }
    ]);
  });

  test('enforces e-mail idempotency within a tenant', async () => {
    const merchantId = await insertMerchant();
    await insertEmail(merchantId, 'checkout:1');
    await expectConstraintViolation(insertEmail(merchantId, 'checkout:1'));
  });

  test('constrains the e-mail delivery state machine', async () => {
    const rows = await dataSource.query<{ COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_deliveries' AND COLUMN_NAME = 'status'",
      [databaseName]
    );
    expect(rows[0]?.COLUMN_TYPE).toBe("enum('QUEUED','SENDING','SENT','FAILED','DEAD_LETTER')");
  });

  test('stores recoverable e-mail fields as ciphertext and exposes only a mask', async () => {
    const columns = await dataSource.query<{ COLUMN_NAME: string; DATA_TYPE: string }[]>(
      "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_deliveries' AND COLUMN_NAME IN ('recipient_ciphertext', 'recipient_masked', 'payload_ciphertext') ORDER BY COLUMN_NAME",
      [databaseName]
    );
    expect(columns).toEqual([
      { COLUMN_NAME: 'payload_ciphertext', DATA_TYPE: 'longblob' },
      { COLUMN_NAME: 'recipient_ciphertext', DATA_TYPE: 'varbinary' },
      { COLUMN_NAME: 'recipient_masked', DATA_TYPE: 'varchar' }
    ]);
  });

  test('atomically leases an e-mail delivery to only one competing worker', async () => {
    const merchantId = await insertMerchant();
    await insertEmail(merchantId, 'checkout:lease');
    const leaseUntil = new Date(Date.now() + 60_000);
    const acquire = () =>
      dataSource.query<{ affectedRows: number }>(
        "UPDATE email_deliveries SET status = 'SENDING', lease_until = ? WHERE merchant_id = ? AND idempotency_key = ? AND status IN ('QUEUED', 'FAILED') AND (lease_until IS NULL OR lease_until < NOW(6))",
        [leaseUntil, merchantId, 'checkout:lease']
      );
    const results = await Promise.all([acquire(), acquire()]);
    expect(results.map(({ affectedRows }) => affectedRows).sort()).toEqual([0, 1]);
  });

  test('keeps audit metadata allowlisted by excluding raw payload and secret columns', async () => {
    const columns = await dataSource.query<{ COLUMN_NAME: string }[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_events'",
      [databaseName]
    );
    expect(columns.map(({ COLUMN_NAME }) => COLUMN_NAME)).not.toEqual(
      expect.arrayContaining(['payload', 'raw_body', 'secret', 'token'])
    );
    expect(columns.map(({ COLUMN_NAME }) => COLUMN_NAME)).toEqual(
      expect.arrayContaining(['action', 'target_type', 'target_public_id', 'metadata_json'])
    );
  });

  test('rejects an audit event for an unknown tenant', async () => {
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO audit_events (id, merchant_id, actor_type, action, target_type, target_public_id, request_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          randomUUID(),
          'SYSTEM',
          'WEBHOOK_CONFIGURED',
          'WEBHOOK',
          'opaque-id',
          randomUUID(),
          JSON.stringify({})
        ]
      )
    );
  });
});
