import { randomUUID } from 'node:crypto';
import { DataSource, type QueryFailedError } from 'typeorm';

import {
  AuthSessionEntity,
  GatewayAccountEntity,
  MerchantEntity,
  UserEntity
} from '../../src/modules/auth/entities/index.js';
import { CheckoutLinkEntity } from '../../src/modules/checkout-links/entities/index.js';
import { PaymentAttemptEntity } from '../../src/modules/payments/entities/index.js';
import {
  FinancialEventEntity,
  TransactionEntity
} from '../../src/modules/transactions/entities/index.js';
import { WalletSnapshotEntity } from '../../src/modules/wallet/entities/index.js';
import { WithdrawalEntity } from '../../src/modules/withdrawals/entities/index.js';
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
      WithdrawalEntity
    ],
    migrations: [
      CreateAuthPersistence1723500000000,
      CreatePaymentPersistence1723501000000,
      CreateWalletWithdrawalPersistence1723502000000
    ],
    migrationsRun: false,
    synchronize: false
  });
}

async function expectConstraintViolation(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject<QueryFailedError>({ name: 'QueryFailedError' });
}

describe('wallet and withdrawal persistence on MySQL 8.4', () => {
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

  async function insertWithdrawal(
    merchantId: string,
    overrides: Record<string, unknown> = {}
  ): Promise<string> {
    const id = typeof overrides.id === 'string' ? overrides.id : randomUUID();
    await dataSource.query(
      'INSERT INTO withdrawals (id, merchant_id, external_reference, amount_cents, status, gateway_withdrawal_id, destination_type, destination_masked, destination_blind_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        merchantId,
        overrides.externalReference ?? `WD-${randomUUID()}`,
        overrides.amountCents ?? '1250',
        overrides.status ?? 'PENDING',
        overrides.gatewayWithdrawalId ?? null,
        'PIX_KEY',
        '***1234',
        Buffer.from(randomUUID())
      ]
    );
    return id;
  }

  test('creates wallet snapshots and withdrawals and adds the withdrawal event foreign key', async () => {
    const tables = await dataSource.query<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('wallet_snapshots', 'withdrawals')",
      [databaseName]
    );
    expect(tables.map(({ TABLE_NAME }) => TABLE_NAME).sort()).toEqual([
      'wallet_snapshots',
      'withdrawals'
    ]);
    const constraints = await dataSource.query<{ CONSTRAINT_NAME: string }[]>(
      "SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'financial_events' AND REFERENCED_TABLE_NAME = 'withdrawals'",
      [databaseName]
    );
    expect(constraints).toEqual([{ CONSTRAINT_NAME: 'fk_financial_events_withdrawal_tenant' }]);
  });

  test('stores wallet balances as unsigned integers beyond the JavaScript safe range', async () => {
    const merchantId = await insertMerchant();
    await dataSource.query(
      'INSERT INTO wallet_snapshots (id, merchant_id, balance_cents, available_cents, captured_at) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), merchantId, '9007199254740993', '9007199254740992', new Date()]
    );
    const rows = await dataSource.query<{ balance_cents: string; available_cents: string }[]>(
      'SELECT CAST(balance_cents AS CHAR) AS balance_cents, CAST(available_cents AS CHAR) AS available_cents FROM wallet_snapshots WHERE merchant_id = ?',
      [merchantId]
    );
    expect(rows).toEqual([
      { balance_cents: '9007199254740993', available_cents: '9007199254740992' }
    ]);
  });

  test('returns the latest wallet snapshot without deleting the prior balance', async () => {
    const merchantId = await insertMerchant();
    const earlier = new Date('2026-08-12T10:00:00.000Z');
    const later = new Date('2026-08-12T11:00:00.000Z');
    for (const [balance, capturedAt] of [
      ['1250', earlier],
      ['2380', later]
    ] as const) {
      await dataSource.query(
        'INSERT INTO wallet_snapshots (id, merchant_id, balance_cents, captured_at) VALUES (?, ?, ?, ?)',
        [randomUUID(), merchantId, balance, capturedAt]
      );
    }
    const latest = await dataSource.query<{ balance_cents: string }[]>(
      'SELECT CAST(balance_cents AS CHAR) AS balance_cents FROM wallet_snapshots WHERE merchant_id = ? ORDER BY captured_at DESC LIMIT 1',
      [merchantId]
    );
    const [{ count }] = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*) AS count FROM wallet_snapshots WHERE merchant_id = ?',
      [merchantId]
    );
    expect(latest).toEqual([{ balance_cents: '2380' }]);
    expect(count).toBe('2');
  });

  test('isolates the latest wallet snapshot query by tenant', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    await dataSource.query(
      'INSERT INTO wallet_snapshots (id, merchant_id, balance_cents, captured_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
      [
        randomUUID(),
        firstMerchant,
        '1250',
        new Date('2026-08-12T10:00:00.000Z'),
        randomUUID(),
        secondMerchant,
        '9999',
        new Date('2026-08-12T11:00:00.000Z')
      ]
    );
    const rows = await dataSource.query<{ balance_cents: string }[]>(
      'SELECT CAST(balance_cents AS CHAR) AS balance_cents FROM wallet_snapshots WHERE merchant_id = ? ORDER BY captured_at DESC LIMIT 1',
      [firstMerchant]
    );
    expect(rows).toEqual([{ balance_cents: '1250' }]);
  });

  test('constrains withdrawal statuses to the approved state machine', async () => {
    const rows = await dataSource.query<{ COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'withdrawals' AND COLUMN_NAME = 'status'",
      [databaseName]
    );
    expect(rows[0]?.COLUMN_TYPE).toBe(
      "enum('PROCESSING','PENDING','RECONCILIATION_PENDING','APPROVED','DENIED','MANUAL_REVIEW')"
    );
  });

  test('rejects arbitrary withdrawal statuses and nonpositive amounts', async () => {
    const merchantId = await insertMerchant();
    await expectConstraintViolation(insertWithdrawal(merchantId, { status: 'ARBITRARY_STATE' }));
    await expectConstraintViolation(insertWithdrawal(merchantId, { amountCents: '0' }));
  });

  test('enforces unique withdrawal references within a tenant', async () => {
    const merchantId = await insertMerchant();
    await insertWithdrawal(merchantId, { externalReference: 'WD-SAME' });
    await expectConstraintViolation(insertWithdrawal(merchantId, { externalReference: 'WD-SAME' }));
  });

  test('allows the same withdrawal reference in different tenants', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    await expect(
      insertWithdrawal(firstMerchant, { externalReference: 'WD-SAME' })
    ).resolves.toBeDefined();
    await expect(
      insertWithdrawal(secondMerchant, { externalReference: 'WD-SAME' })
    ).resolves.toBeDefined();
  });

  test('enforces unique non-null gateway withdrawal ids within a tenant', async () => {
    const merchantId = await insertMerchant();
    await insertWithdrawal(merchantId, { gatewayWithdrawalId: 'gateway-withdrawal-1' });
    await expectConstraintViolation(
      insertWithdrawal(merchantId, { gatewayWithdrawalId: 'gateway-withdrawal-1' })
    );
  });

  test('contains no plaintext withdrawal destination or document columns', async () => {
    const columns = await dataSource.query<{ COLUMN_NAME: string; DATA_TYPE: string }[]>(
      "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'withdrawals'",
      [databaseName]
    );
    expect(columns.map(({ COLUMN_NAME }) => COLUMN_NAME)).not.toEqual(
      expect.arrayContaining(['pix_key', 'document', 'destination_plaintext'])
    );
    expect(columns).toEqual(
      expect.arrayContaining([
        { COLUMN_NAME: 'destination_masked', DATA_TYPE: 'varchar' },
        { COLUMN_NAME: 'destination_blind_index', DATA_TYPE: 'varbinary' }
      ])
    );
  });

  test('accepts a financial event for a withdrawal in the same tenant', async () => {
    const merchantId = await insertMerchant();
    const withdrawalId = await insertWithdrawal(merchantId);
    await expect(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, withdrawal_id, event_type, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          withdrawalId,
          'STATUS_CHANGED',
          'PENDING',
          'SYSTEM',
          new Date(),
          JSON.stringify({})
        ]
      )
    ).resolves.toBeDefined();
  });

  test('rejects a withdrawal financial event that crosses tenants', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    const withdrawalId = await insertWithdrawal(firstMerchant);
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, withdrawal_id, event_type, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          secondMerchant,
          withdrawalId,
          'STATUS_CHANGED',
          'PENDING',
          'SYSTEM',
          new Date(),
          JSON.stringify({})
        ]
      )
    );
  });

  test('persists withdrawal reconciliation scheduling and sanitized error fields', async () => {
    const merchantId = await insertMerchant();
    const withdrawalId = await insertWithdrawal(merchantId);
    const next = new Date('2026-08-12T12:00:00.000Z');
    await dataSource.query(
      'UPDATE withdrawals SET reconciliation_attempts = ?, next_reconciliation_at = ?, lease_until = ?, last_error_code = ? WHERE id = ?',
      [2, next, next, 'GATEWAY_TIMEOUT', withdrawalId]
    );
    const rows = await dataSource.query<
      {
        reconciliation_attempts: number;
        last_error_code: string;
      }[]
    >('SELECT reconciliation_attempts, last_error_code FROM withdrawals WHERE id = ?', [
      withdrawalId
    ]);
    expect(rows).toEqual([{ reconciliation_attempts: 2, last_error_code: 'GATEWAY_TIMEOUT' }]);
  });
});
