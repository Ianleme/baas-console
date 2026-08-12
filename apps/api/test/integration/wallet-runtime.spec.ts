import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { createApplicationDataSource } from '../../src/database/data-source.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import { GATEWAY_WALLET } from '../../src/modules/wallet/wallet.module.js';
import {
  configureApplication,
  createOpenApiDocument
} from '../../src/platform/configure-application.js';

describe('authoritative wallet HTTP runtime', () => {
  let app: INestApplication;
  let merchantA = '';
  let merchantB = '';
  let bearerA = '';
  let bearerB = '';
  const gateway = {
    getWallet: jest.fn().mockResolvedValue({
      balanceCents: '97',
      capturedAt: new Date('2026-08-12T00:00:00.000Z'),
      sourceRequestId: 'gateway-wallet-1'
    })
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_HOST: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
      DATABASE_PORT: process.env.MYSQL_TEST_PORT ?? '33078',
      DATABASE_USER: process.env.MYSQL_TEST_USER ?? 'baas',
      DATABASE_PASSWORD: process.env.MYSQL_TEST_PASSWORD ?? 'baas-test-password',
      DATABASE_NAME: process.env.MYSQL_TEST_DATABASE ?? 'baas_test',
      AUTH_TOKEN_SECRET: 'test-auth-token-secret-at-least-32-bytes',
      ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
      LERA_BOX_BASE_URL: 'https://gateway.invalid',
      PUBLIC_API_BASE_URL: 'https://api.example.test'
    });
    const bootstrap: DataSource = createApplicationDataSource();
    await bootstrap.initialize();
    await bootstrap.dropDatabase();
    await bootstrap.runMigrations({ transaction: 'each' });
    await bootstrap.destroy();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GATEWAY_WALLET)
      .useValue(gateway)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.get(DatabaseService).connect();
    await app.init();

    ({ merchantId: merchantA, bearer: bearerA } = await register(
      'wallet-a@example.test',
      'Merchant A'
    ));
    ({ merchantId: merchantB, bearer: bearerB } = await register(
      'wallet-b@example.test',
      'Merchant B'
    ));
    await connectGateway(merchantA, 'server-gateway-token-a');
    await connectGateway(merchantB, 'server-gateway-token-b');
  });

  afterAll(async () => app.close());

  test('publishes current and refresh wallet routes in Swagger', () => {
    expect(Object.keys(createOpenApiDocument(app).paths)).toEqual(
      expect.arrayContaining(['/api/v1/wallet', '/api/v1/wallet/refresh'])
    );
  });

  test.each([
    ['get', '/api/v1/wallet'],
    ['post', '/api/v1/wallet/refresh']
  ] as const)('requires local authentication for %s %s', async (method, path) => {
    const response = request(server())[method](path);
    await response.expect(401).expect(({ body }) => {
      expect(body as unknown).toMatchObject({ code: 'AUTH_REQUIRED' });
    });
  });

  test('refreshes with the server credential and persists exact cents and timestamp', async () => {
    const response = await request(server())
      .post('/api/v1/wallet/refresh')
      .set('Authorization', `Bearer ${bearerA}`)
      .expect(201);
    expect(response.body as unknown).toEqual({
      balanceCents: '97',
      capturedAt: '2026-08-12T00:00:00.000Z',
      stale: false
    });
    expect(gateway.getWallet).toHaveBeenCalledWith('server-gateway-token-a');
    const rows = await app
      .get(DatabaseService)
      .getDataSource()
      .query<
        { balance_cents: string; captured_at: Date }[]
      >('SELECT CAST(balance_cents AS CHAR) balance_cents, captured_at FROM wallet_snapshots WHERE merchant_id = ?', [merchantA]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.balance_cents).toBe('97');
    expect(rows[0]?.captured_at.toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });

  test('preserves the prior snapshot and marks it stale when refresh fails', async () => {
    gateway.getWallet.mockRejectedValueOnce(new Error('LERA_BOX_TIMEOUT'));
    const response = await request(server())
      .post('/api/v1/wallet/refresh')
      .set('Authorization', `Bearer ${bearerA}`)
      .expect(201);
    expect(response.body as unknown).toEqual({
      balanceCents: '97',
      capturedAt: '2026-08-12T00:00:00.000Z',
      stale: true
    });
    const [{ count }] = await app
      .get(DatabaseService)
      .getDataSource()
      .query<
        { count: string }[]
      >('SELECT COUNT(*) count FROM wallet_snapshots WHERE merchant_id = ?', [merchantA]);
    expect(count).toBe('1');
  });

  test('never exposes another tenant snapshot as a fallback', async () => {
    const response = await request(server())
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${bearerB}`)
      .expect(503);
    expect(response.body as unknown).toMatchObject({ code: 'GATEWAY_UNAVAILABLE' });
  });

  test('returns gateway unavailable instead of zero when first refresh fails', async () => {
    gateway.getWallet.mockRejectedValueOnce(new Error('LERA_BOX_CONNECTION_FAILED'));
    const response = await request(server())
      .post('/api/v1/wallet/refresh')
      .set('Authorization', `Bearer ${bearerB}`)
      .expect(503);
    expect(response.body as unknown).toMatchObject({ code: 'GATEWAY_UNAVAILABLE' });
    expect(JSON.stringify(response.body)).not.toContain('balanceCents');
  });

  function server(): Server {
    return app.getHttpServer() as Server;
  }

  async function register(email: string, displayName: string) {
    const response = await request(server())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'StrongPassword123',
        legalName: `Wallet Merchant ${displayName}`,
        displayName
      })
      .expect(201);
    const body = response.body as { accessToken: string; principal: { merchantId: string } };
    return { merchantId: body.principal.merchantId, bearer: body.accessToken };
  }

  async function connectGateway(merchantId: string, accessToken: string): Promise<void> {
    const accountId = crypto.randomUUID();
    const encrypted = app
      .get(EncryptionService)
      .encrypt(accessToken, merchantId, accountId, 'accessToken');
    await app
      .get(DatabaseService)
      .getDataSource()
      .query(
        `INSERT INTO gateway_accounts
         (id, merchant_id, status, expected_document, expected_person_type, access_token_ciphertext)
         VALUES (?, ?, 'ACTIVE', '52998224725', 'PF', ?)`,
        [accountId, merchantId, encrypted]
      );
  }
});
