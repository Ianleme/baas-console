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
import { CreateAuthPersistence1723500000000 } from '../../src/migrations/1723500000000-CreateAuthPersistence.js';
import { CreatePaymentPersistence1723501000000 } from '../../src/migrations/1723501000000-CreatePaymentPersistence.js';
import { AllowGatewayInstallments1723504000000 } from '../../src/migrations/1723504000000-AllowGatewayInstallments.js';

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
      FinancialEventEntity
    ],
    migrations: [
      CreateAuthPersistence1723500000000,
      CreatePaymentPersistence1723501000000,
      AllowGatewayInstallments1723504000000
    ],
    migrationsRun: false,
    synchronize: false
  });
}

async function expectConstraintViolation(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject<QueryFailedError>({ name: 'QueryFailedError' });
}

describe('checkout and payment persistence on MySQL 8.4', () => {
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

  async function insertLink(
    merchantId: string,
    overrides: Record<string, unknown> = {}
  ): Promise<string> {
    const id = typeof overrides.id === 'string' ? overrides.id : randomUUID();
    await dataSource.query(
      'INSERT INTO checkout_links (id, merchant_id, public_reference, description, amount_cents, allowed_methods, max_installments, fee_snapshot_json, status, expires_at, public_token_hash, public_token_ciphertext) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        merchantId,
        overrides.publicReference ?? `REF-${randomUUID()}`,
        'Technical challenge payment',
        overrides.amountCents ?? '1250',
        overrides.allowedMethods ?? 'PIX_CARD',
        overrides.maxInstallments ?? 3,
        JSON.stringify({ installments: [{ count: 3, feeBps: 250 }] }),
        overrides.status ?? 'ACTIVE',
        new Date(Date.now() + 86_400_000),
        overrides.publicTokenHash ?? Buffer.from(randomUUID()),
        Buffer.from('encrypted-public-token')
      ]
    );
    return id;
  }

  async function insertAttempt(
    merchantId: string,
    checkoutLinkId: string,
    status = 'PENDING'
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO payment_attempts (id, merchant_id, checkout_link_id, method, status, external_reference, installments, fee_bps, gross_amount_cents, fee_amount_cents, net_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        merchantId,
        checkoutLinkId,
        'CARD',
        status,
        `PAY-${randomUUID()}`,
        3,
        250,
        '1250',
        '31',
        '1219'
      ]
    );
    return id;
  }

  test('creates checkout, payment, transaction and financial-event tables', async () => {
    const rows = await dataSource.query<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('checkout_links', 'payment_attempts', 'transactions', 'financial_events')",
      [databaseName]
    );
    expect(rows.map(({ TABLE_NAME }) => TABLE_NAME).sort()).toEqual([
      'checkout_links',
      'financial_events',
      'payment_attempts',
      'transactions'
    ]);
  });

  test('uses unsigned integer storage for cents and basis points', async () => {
    const rows = await dataSource.query<{ COLUMN_NAME: string; COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_attempts' AND COLUMN_NAME IN ('fee_bps', 'gross_amount_cents', 'fee_amount_cents', 'net_amount_cents')",
      [databaseName]
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ COLUMN_NAME: 'fee_bps', COLUMN_TYPE: 'smallint unsigned' }),
        expect.objectContaining({
          COLUMN_NAME: 'gross_amount_cents',
          COLUMN_TYPE: 'bigint unsigned'
        }),
        expect.objectContaining({
          COLUMN_NAME: 'fee_amount_cents',
          COLUMN_TYPE: 'bigint unsigned'
        }),
        expect.objectContaining({ COLUMN_NAME: 'net_amount_cents', COLUMN_TYPE: 'bigint unsigned' })
      ])
    );
  });

  test('preserves cents beyond the JavaScript safe integer range', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId, { amountCents: '9007199254740993' });
    const rows = await dataSource.query<{ amount_cents: string }[]>(
      'SELECT amount_cents FROM checkout_links WHERE id = ?',
      [linkId]
    );
    expect(rows).toEqual([{ amount_cents: '9007199254740993' }]);
  });

  test('rejects zero-value checkout links', async () => {
    const merchantId = await insertMerchant();
    await expectConstraintViolation(insertLink(merchantId, { amountCents: '0' }));
  });

  test('enforces public-reference uniqueness inside a tenant', async () => {
    const merchantId = await insertMerchant();
    await insertLink(merchantId, { publicReference: 'ORDER-42' });
    await expectConstraintViolation(insertLink(merchantId, { publicReference: 'ORDER-42' }));
  });

  test('allows the same public reference in isolated tenants', async () => {
    const first = await insertMerchant();
    const second = await insertMerchant();
    await expect(
      Promise.all([
        insertLink(first, { publicReference: 'ORDER-42' }),
        insertLink(second, { publicReference: 'ORDER-42' })
      ])
    ).resolves.toHaveLength(2);
  });

  test('rejects checkout links for an unknown tenant', async () => {
    await expectConstraintViolation(insertLink(randomUUID()));
  });

  test('enforces globally unique public token hashes', async () => {
    const merchantId = await insertMerchant();
    const hash = Buffer.from('same-token-hash');
    await insertLink(merchantId, { publicTokenHash: hash });
    await expectConstraintViolation(insertLink(merchantId, { publicTokenHash: hash }));
  });

  test('rejects installments outside the supported range', async () => {
    const merchantId = await insertMerchant();
    await expectConstraintViolation(insertLink(merchantId, { maxInstallments: 22 }));
  });

  test('accepts payment attempts linked to the same tenant', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await expect(insertAttempt(merchantId, linkId)).resolves.toBeDefined();
  });

  test('rejects payment attempts linked across tenants', async () => {
    const first = await insertMerchant();
    const second = await insertMerchant();
    const linkId = await insertLink(first);
    await expectConstraintViolation(insertAttempt(second, linkId));
  });

  test('enforces one unresolved attempt per checkout link', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await insertAttempt(merchantId, linkId, 'PROCESSING');
    await expectConstraintViolation(insertAttempt(merchantId, linkId, 'RECONCILIATION_PENDING'));
  });

  test('enforces unresolved-attempt uniqueness under concurrent inserts', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    const outcomes = await Promise.allSettled([
      insertAttempt(merchantId, linkId, 'PENDING'),
      insertAttempt(merchantId, linkId, 'PROCESSING')
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  test('allows another attempt after a definitive denial', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await insertAttempt(merchantId, linkId, 'DENIED');
    await expect(insertAttempt(merchantId, linkId, 'PENDING')).resolves.toBeDefined();
  });

  test('rejects basis points above one hundred percent', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO payment_attempts (id, merchant_id, checkout_link_id, method, status, external_reference, installments, fee_bps, gross_amount_cents, fee_amount_cents, net_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          linkId,
          'CARD',
          'DENIED',
          `PAY-${randomUUID()}`,
          1,
          10001,
          '1250',
          '31',
          '1219'
        ]
      )
    );
  });

  test('rejects inconsistent gross, fee and net amounts', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO payment_attempts (id, merchant_id, checkout_link_id, method, status, external_reference, installments, fee_bps, gross_amount_cents, fee_amount_cents, net_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          linkId,
          'CARD',
          'DENIED',
          `PAY-${randomUUID()}`,
          1,
          250,
          '1250',
          '31',
          '999'
        ]
      )
    );
  });

  test('contains no PAN, CVV, cardholder name or raw request columns', async () => {
    const rows = await dataSource.query<{ COLUMN_NAME: string }[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_attempts'",
      [databaseName]
    );
    expect(rows.map(({ COLUMN_NAME }) => COLUMN_NAME)).not.toEqual(
      expect.arrayContaining(['pan', 'card_number', 'cvv', 'cardholder_name', 'raw_request'])
    );
  });

  test('enforces one transaction projection per tenant origin', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    const attemptId = await insertAttempt(merchantId, linkId, 'APPROVED');
    const insert = () =>
      dataSource.query(
        'INSERT INTO transactions (id, merchant_id, origin_type, origin_id, external_reference, type, status, gross_amount_cents, fee_amount_cents, net_amount_cents, occurred_at, projection_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          'PAYMENT',
          attemptId,
          `TX-${randomUUID()}`,
          'CREDIT',
          'APPROVED',
          '1250',
          '31',
          '1219',
          new Date(),
          1
        ]
      );
    await insert();
    await expectConstraintViolation(insert());
  });

  test('requires exactly one financial-event origin', async () => {
    const merchantId = await insertMerchant();
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, event_type, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          'STATUS_CHANGED',
          'APPROVED',
          'GATEWAY',
          new Date(),
          JSON.stringify({})
        ]
      )
    );
  });

  test('rejects a payment financial event crossing tenant boundaries', async () => {
    const first = await insertMerchant();
    const second = await insertMerchant();
    const linkId = await insertLink(first);
    const attemptId = await insertAttempt(first, linkId, 'APPROVED');
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, payment_attempt_id, event_type, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          second,
          attemptId,
          'STATUS_CHANGED',
          'APPROVED',
          'GATEWAY',
          new Date(),
          JSON.stringify({})
        ]
      )
    );
  });

  test('matches every state in the approved payment-attempt machine', async () => {
    const rows = await dataSource.query<{ COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_attempts' AND COLUMN_NAME = 'status'",
      [databaseName]
    );
    expect(rows[0]?.COLUMN_TYPE).toBe(
      "enum('PROCESSING','PENDING','RECONCILIATION_PENDING','APPROVED','DENIED','EXPIRED','MANUAL_REVIEW')"
    );
  });

  test('rejects FAILED as a payment-attempt state', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await expectConstraintViolation(insertAttempt(merchantId, linkId, 'FAILED'));
  });

  test('keeps MANUAL_REVIEW unresolved and blocks a new attempt', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await insertAttempt(merchantId, linkId, 'MANUAL_REVIEW');
    await expectConstraintViolation(insertAttempt(merchantId, linkId, 'PENDING'));
  });

  test('treats EXPIRED as terminal and permits a new attempt', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    await insertAttempt(merchantId, linkId, 'EXPIRED');
    await expect(insertAttempt(merchantId, linkId, 'PENDING')).resolves.toBeDefined();
  });

  test('supports expired and cancelled transaction projections', async () => {
    const rows = await dataSource.query<{ COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'status'",
      [databaseName]
    );
    expect(rows[0]?.COLUMN_TYPE).toContain("'EXPIRED'");
    expect(rows[0]?.COLUMN_TYPE).toContain("'CANCELLED'");
  });

  test('matches the exact approved transaction projection states', async () => {
    const rows = await dataSource.query<{ COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'status'",
      [databaseName]
    );
    expect(rows[0]?.COLUMN_TYPE).toBe(
      "enum('PENDING','APPROVED','DENIED','EXPIRED','CANCELLED','RECONCILIATION_PENDING','MANUAL_REVIEW')"
    );
  });

  test('rejects REVERSED and arbitrary transaction projection states', async () => {
    const merchantId = await insertMerchant();
    for (const status of ['REVERSED', 'ARBITRARY_STATE']) {
      await expectConstraintViolation(
        dataSource.query(
          'INSERT INTO transactions (id, merchant_id, origin_type, origin_id, external_reference, type, status, gross_amount_cents, fee_amount_cents, net_amount_cents, occurred_at, projection_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            randomUUID(),
            merchantId,
            'PAYMENT',
            randomUUID(),
            `TX-${randomUUID()}`,
            'CREDIT',
            status,
            '1250',
            '31',
            '1219',
            new Date(),
            1
          ]
        )
      );
    }
  });

  test('restricts financial-event states to the payment and withdrawal union', async () => {
    const rows = await dataSource.query<{ COLUMN_NAME: string; COLUMN_TYPE: string }[]>(
      "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'financial_events' AND COLUMN_NAME IN ('previous_status', 'new_status') ORDER BY COLUMN_NAME",
      [databaseName]
    );
    const expected =
      "enum('PROCESSING','PENDING','RECONCILIATION_PENDING','APPROVED','DENIED','EXPIRED','MANUAL_REVIEW')";
    expect(rows).toEqual([
      { COLUMN_NAME: 'new_status', COLUMN_TYPE: expected },
      { COLUMN_NAME: 'previous_status', COLUMN_TYPE: expected }
    ]);
  });

  test('rejects an arbitrary financial-event state', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    const attemptId = await insertAttempt(merchantId, linkId, 'APPROVED');
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, payment_attempt_id, event_type, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          attemptId,
          'STATUS_CHANGED',
          'ARBITRARY_STATE',
          'GATEWAY',
          new Date(),
          JSON.stringify({})
        ]
      )
    );
  });

  test('accepts a null previous state and rejects an arbitrary previous state', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    const attemptId = await insertAttempt(merchantId, linkId, 'APPROVED');
    await expect(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, payment_attempt_id, event_type, previous_status, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          attemptId,
          'STATUS_CHANGED',
          null,
          'APPROVED',
          'GATEWAY',
          new Date(),
          JSON.stringify({})
        ]
      )
    ).resolves.toBeDefined();
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, payment_attempt_id, event_type, previous_status, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          attemptId,
          'STATUS_CHANGED',
          'ARBITRARY_STATE',
          'APPROVED',
          'GATEWAY',
          new Date(),
          JSON.stringify({})
        ]
      )
    );
  });

  test('rejects a financial event with both payment and withdrawal origins', async () => {
    const merchantId = await insertMerchant();
    const linkId = await insertLink(merchantId);
    const attemptId = await insertAttempt(merchantId, linkId, 'APPROVED');
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO financial_events (id, merchant_id, payment_attempt_id, withdrawal_id, event_type, new_status, source, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          attemptId,
          randomUUID(),
          'STATUS_CHANGED',
          'APPROVED',
          'GATEWAY',
          new Date(),
          JSON.stringify({})
        ]
      )
    );
  });

  test('accepts the gateway maximum of 21 card installments', async () => {
    const merchantId = await insertMerchant();
    await expect(
      insertLink(merchantId, { allowedMethods: 'CARD', maxInstallments: 21 })
    ).resolves.toBeDefined();
  });
});
