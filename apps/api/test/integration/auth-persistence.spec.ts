import { randomUUID } from 'node:crypto';
import { DataSource, type QueryFailedError } from 'typeorm';

import {
  AuthSessionEntity,
  GatewayAccountEntity,
  MerchantEntity,
  UserEntity
} from '../../src/modules/auth/entities/index.js';
import { CreateAuthPersistence1723500000000 } from '../../src/migrations/1723500000000-CreateAuthPersistence.js';
import { AddUserFullName1723506000000 } from '../../src/migrations/1723506000000-AddUserFullName.js';

interface ColumnMetadata {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATETIME_PRECISION: number | null;
}

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
    entities: [MerchantEntity, UserEntity, AuthSessionEntity, GatewayAccountEntity],
    migrations: [CreateAuthPersistence1723500000000, AddUserFullName1723506000000],
    migrationsRun: false,
    synchronize: false
  });
}

async function expectConstraintViolation(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject<QueryFailedError>({ name: 'QueryFailedError' });
}

describe('authentication persistence on MySQL 8.4', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource();
    await dataSource.initialize();
    await dataSource.dropDatabase();
    await dataSource.runMigrations({ transaction: 'all' });
  }, 30000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of ['auth_sessions', 'gateway_accounts', 'users', 'merchants']) {
        await queryRunner.query(`TRUNCATE TABLE \`${table}\``);
      }
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      await queryRunner.release();
    }
  }, 30000);

  async function insertMerchant(id = randomUUID()): Promise<string> {
    await dataSource.query(
      'INSERT INTO merchants (id, legal_name, display_name, status, demo_mode) VALUES (?, ?, ?, ?, ?)',
      [id, `Legal ${id}`, `Display ${id}`, 'ACTIVE', false]
    );
    return id;
  }

  async function insertUser(merchantId: string, normalizedEmail: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO users (id, merchant_id, email, email_normalized, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, merchantId, normalizedEmail, normalizedEmail, 'argon2id-hash', 'ACTIVE']
    );
    return id;
  }

  test('runs the empty migration and creates the four authentication tables', async () => {
    const tables = await dataSource.query<{ TABLE_NAME: string }[]>(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?)',
      [databaseName, 'merchants', 'users', 'auth_sessions', 'gateway_accounts']
    );
    expect(tables.map(({ TABLE_NAME }) => TABLE_NAME).sort()).toEqual([
      'auth_sessions',
      'gateway_accounts',
      'merchants',
      'users'
    ]);
  });

  test('uses microsecond precision for all persisted timestamps', async () => {
    const columns = await dataSource.query<ColumnMetadata[]>(
      "SELECT COLUMN_NAME, DATA_TYPE, DATETIME_PRECISION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('merchants', 'users', 'auth_sessions', 'gateway_accounts') AND COLUMN_NAME IN ('created_at', 'updated_at')",
      [databaseName]
    );
    expect(columns).toHaveLength(8);
    expect(
      columns.every(
        ({ DATA_TYPE, DATETIME_PRECISION }) => DATA_TYPE === 'datetime' && DATETIME_PRECISION === 6
      )
    ).toBe(true);
  });

  test('enforces globally unique normalized login e-mail', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    await insertUser(firstMerchant, 'owner@example.test');
    await expectConstraintViolation(insertUser(secondMerchant, 'owner@example.test'));
  });

  test('allows e-mail display casing while uniqueness follows the normalized value', async () => {
    const merchantId = await insertMerchant();
    await dataSource.query(
      'INSERT INTO users (id, merchant_id, email, email_normalized, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        merchantId,
        'Owner@Example.Test',
        'owner@example.test',
        'argon2id-hash',
        'ACTIVE'
      ]
    );
    const rows = await dataSource.query<{ email: string; email_normalized: string }[]>(
      'SELECT email, email_normalized FROM users WHERE merchant_id = ?',
      [merchantId]
    );
    expect(rows).toEqual([{ email: 'Owner@Example.Test', email_normalized: 'owner@example.test' }]);
  });

  test('persists owner full name and keeps legacy names nullable', async () => {
    const merchantId = await insertMerchant();
    await dataSource.query(
      'INSERT INTO users (id, merchant_id, email, full_name, email_normalized, password_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        merchantId,
        'owner@example.test',
        'Owner Aurora',
        'owner@example.test',
        'argon2id-hash',
        'ACTIVE'
      ]
    );
    const legacyMerchantId = await insertMerchant();
    await insertUser(legacyMerchantId, 'legacy@example.test');
    const rows = await dataSource.query<{ email: string; full_name: string | null }[]>(
      'SELECT email, full_name FROM users ORDER BY email'
    );
    expect(rows).toEqual([
      { email: 'legacy@example.test', full_name: null },
      { email: 'owner@example.test', full_name: 'Owner Aurora' }
    ]);
  });

  test('defines full name as a nullable legacy-compatible column', async () => {
    const [column] = await dataSource.query<
      { IS_NULLABLE: string; COLUMN_DEFAULT: string | null }[]
    >(
      "SELECT IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'",
      [databaseName]
    );
    expect(column).toEqual({ IS_NULLABLE: 'YES', COLUMN_DEFAULT: null });
  });

  test('enforces one owner user per merchant', async () => {
    const merchantId = await insertMerchant();
    await insertUser(merchantId, 'first@example.test');
    await expectConstraintViolation(insertUser(merchantId, 'second@example.test'));
  });

  test('enforces unique refresh-token hashes', async () => {
    const merchantId = await insertMerchant();
    const userId = await insertUser(merchantId, 'owner@example.test');
    const values = [
      merchantId,
      userId,
      randomUUID(),
      Buffer.alloc(32, 1),
      new Date(Date.now() + 60_000)
    ];
    await dataSource.query(
      'INSERT INTO auth_sessions (id, merchant_id, user_id, family_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), ...values]
    );
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO auth_sessions (id, merchant_id, user_id, family_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), ...values]
      )
    );
  });

  test('allows multiple rotated sessions in the same token family', async () => {
    const merchantId = await insertMerchant();
    const userId = await insertUser(merchantId, 'owner@example.test');
    const familyId = randomUUID();
    for (const marker of [1, 2]) {
      await dataSource.query(
        'INSERT INTO auth_sessions (id, merchant_id, user_id, family_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          userId,
          familyId,
          Buffer.alloc(32, marker),
          new Date(Date.now() + 60_000)
        ]
      );
    }
    const [{ count }] = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*) AS count FROM auth_sessions WHERE family_id = ?',
      [familyId]
    );
    expect(count).toBe('2');
  });

  test('accepts a session whose user belongs to the same tenant', async () => {
    const merchantId = await insertMerchant();
    const userId = await insertUser(merchantId, 'owner@example.test');
    await expect(
      dataSource.query(
        'INSERT INTO auth_sessions (id, merchant_id, user_id, family_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          userId,
          randomUUID(),
          Buffer.alloc(32, 1),
          new Date(Date.now() + 60_000)
        ]
      )
    ).resolves.toBeDefined();
  });

  test('rejects a session that points to a user from another tenant', async () => {
    const firstMerchant = await insertMerchant();
    const secondMerchant = await insertMerchant();
    const firstUser = await insertUser(firstMerchant, 'first@example.test');
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO auth_sessions (id, merchant_id, user_id, family_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          secondMerchant,
          firstUser,
          randomUUID(),
          Buffer.alloc(32, 1),
          new Date(Date.now() + 60_000)
        ]
      )
    );
  });

  test('enforces one gateway account per merchant', async () => {
    const merchantId = await insertMerchant();
    const insert = () =>
      dataSource.query(
        'INSERT INTO gateway_accounts (id, merchant_id, status, codigo_cliente_ciphertext, chave_loja_ciphertext, access_token_ciphertext) VALUES (?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          merchantId,
          'ACTIVE',
          Buffer.from('cipher-a'),
          Buffer.from('cipher-b'),
          Buffer.from('cipher-c')
        ]
      );
    await insert();
    await expectConstraintViolation(insert());
  });

  test('rejects a gateway account for an unknown tenant', async () => {
    await expectConstraintViolation(
      dataSource.query(
        'INSERT INTO gateway_accounts (id, merchant_id, status, codigo_cliente_ciphertext, chave_loja_ciphertext, access_token_ciphertext) VALUES (?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          randomUUID(),
          'ACTIVE',
          Buffer.from('cipher-a'),
          Buffer.from('cipher-b'),
          Buffer.from('cipher-c')
        ]
      )
    );
  });

  test('contains no plaintext authentication or gateway-secret columns', async () => {
    const columns = await dataSource.query<{ COLUMN_NAME: string }[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('auth_sessions', 'gateway_accounts')",
      [databaseName]
    );
    const names = columns.map(({ COLUMN_NAME }) => COLUMN_NAME);
    expect(names).not.toEqual(
      expect.arrayContaining([
        'refresh_token',
        'password',
        'gateway_password',
        'codigo_cliente',
        'chave_loja',
        'access_token'
      ])
    );
  });

  test('stores every persisted gateway credential in binary ciphertext columns', async () => {
    const columns = await dataSource.query<ColumnMetadata[]>(
      "SELECT COLUMN_NAME, DATA_TYPE, DATETIME_PRECISION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'gateway_accounts' AND COLUMN_NAME LIKE '%_ciphertext'",
      [databaseName]
    );
    expect(columns).toHaveLength(3);
    expect(columns.every(({ DATA_TYPE }) => DATA_TYPE === 'varbinary')).toBe(true);
  });

  test('declares schema synchronization disabled in the integration data source', () => {
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
  });

  test('finds an owner only through its session-derived tenant', async () => {
    const merchantId = await insertMerchant();
    const userId = await insertUser(merchantId, 'owner@example.test');
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE id = ? AND merchant_id = ?',
      [userId, merchantId]
    );
    expect(rows).toEqual([{ id: userId }]);
  });

  test('returns no row for a cross-tenant owner lookup', async () => {
    const merchantId = await insertMerchant();
    const otherMerchantId = await insertMerchant();
    const userId = await insertUser(merchantId, 'owner@example.test');
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM users WHERE id = ? AND merchant_id = ?',
      [userId, otherMerchantId]
    );
    expect(rows).toEqual([]);
  });

  test('persists the unknown remote-registration state without fabricating credentials', async () => {
    const merchantId = await insertMerchant();
    await dataSource.query(
      'INSERT INTO gateway_accounts (id, merchant_id, status, expected_document, expected_person_type) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), merchantId, 'GATEWAY_REGISTRATION_UNKNOWN', 'masked-document', 'PF']
    );
    const rows = await dataSource.query<Record<string, unknown>[]>(
      'SELECT status, expected_document, expected_person_type, access_token_ciphertext FROM gateway_accounts WHERE merchant_id = ?',
      [merchantId]
    );
    expect(rows).toEqual([
      {
        status: 'GATEWAY_REGISTRATION_UNKNOWN',
        expected_document: 'masked-document',
        expected_person_type: 'PF',
        access_token_ciphertext: null
      }
    ]);
  });

  test('persists a conclusive failed registration state independently', async () => {
    const merchantId = await insertMerchant();
    await dataSource.query(
      'INSERT INTO gateway_accounts (id, merchant_id, status, last_error_code) VALUES (?, ?, ?, ?)',
      [randomUUID(), merchantId, 'GATEWAY_REGISTRATION_FAILED', 'GATEWAY_REGISTRATION_FAILED']
    );
    const [{ status }] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM gateway_accounts WHERE merchant_id = ?',
      [merchantId]
    );
    expect(status).toBe('GATEWAY_REGISTRATION_FAILED');
  });
});
