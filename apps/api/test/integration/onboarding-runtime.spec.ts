import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { createApplicationDataSource } from '../../src/database/data-source.js';
import { DatabaseService } from '../../src/database/database.service.js';
import type { GatewayIdentityPort } from '../../src/modules/gateway-accounts/gateway-onboarding.service.js';
import { GATEWAY_IDENTITY } from '../../src/modules/gateway-accounts/gateway-accounts.module.js';
import { LeraBoxTimeoutError } from '../../src/integrations/lera-box/auth/lera-box-identity.client.js';
import {
  configureApplication,
  createOpenApiDocument
} from '../../src/platform/configure-application.js';

const registration = {
  personType: 'PF',
  name: 'Owner Sandbox',
  tradingName: 'Loja Sandbox',
  email: 'owner-onboarding@example.test',
  phone: '18996910501',
  document: '12345678901',
  zipCode: '19000000',
  address: 'Rua Teste',
  number: '1',
  neighborhood: 'Centro',
  city: 'Presidente Prudente',
  state: 'SP',
  password: 'StrongPassword123'
};

function serverOf(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
function tokenOf(response: request.Response): string {
  const body = response.body as { accessToken?: unknown };
  if (typeof body.accessToken !== 'string') throw new Error('ACCESS_TOKEN_MISSING');
  return body.accessToken;
}

describe('gateway onboarding HTTP runtime', () => {
  let app: INestApplication;
  let gateway: GatewayIdentityPort & {
    registerCalls: number;
    mismatch: boolean;
    registrationError?: Error;
  };

  beforeAll(async () => {
    process.env.DATABASE_HOST = process.env.MYSQL_TEST_HOST ?? '127.0.0.1';
    process.env.DATABASE_PORT = process.env.MYSQL_TEST_PORT ?? '33078';
    process.env.DATABASE_USER = process.env.MYSQL_TEST_USER ?? 'baas';
    process.env.DATABASE_PASSWORD = process.env.MYSQL_TEST_PASSWORD ?? 'baas-test-password';
    process.env.DATABASE_NAME = process.env.MYSQL_TEST_DATABASE ?? 'baas_test';
    process.env.AUTH_TOKEN_SECRET = 'test-auth-token-secret-at-least-32-bytes';
    process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
    const bootstrap: DataSource = createApplicationDataSource();
    await bootstrap.initialize();
    await bootstrap.dropDatabase();
    await bootstrap.runMigrations({ transaction: 'each' });
    await bootstrap.destroy();
    gateway = {
      registerCalls: 0,
      mismatch: false,
      registerUser() {
        this.registerCalls += 1;
        return this.registrationError ? Promise.reject(this.registrationError) : Promise.resolve();
      },
      login: () =>
        Promise.resolve({
          accessToken: 'gateway-access-secret',
          tokenType: 'Bearer',
          codigoCliente: 42,
          chaveLoja: 'gateway-store-secret',
          user: {
            id: 'remote-user',
            personType: 'PF',
            name: registration.name,
            tradingName: registration.tradingName,
            email: registration.email,
            document: registration.document
          }
        }),
      getCurrentUser() {
        return Promise.resolve({
          id: 'remote-user',
          personType: 'PF',
          name: registration.name,
          tradingName: registration.tradingName,
          email: registration.email,
          phone: registration.phone,
          document: this.mismatch ? 'other-document' : registration.document,
          codigoCliente: 42,
          chaveLoja: 'gateway-store-secret',
          emailConfirmed: true,
          createdAt: '2026-08-12T00:00:00Z'
        });
      },
      profilesMatch(profile, expected) {
        return profile.document === expected.document && profile.personType === expected.personType;
      }
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GATEWAY_IDENTITY)
      .useValue(gateway)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.get(DatabaseService).connect();
    await app.init();
  });
  afterAll(async () => app.close());

  test('publishes registration and authenticated connection in Swagger', () => {
    expect(Object.keys(createOpenApiDocument(app).paths)).toEqual(
      expect.arrayContaining(['/api/v1/auth/register', '/api/v1/gateway-account/connect'])
    );
  });

  test('accepts the frontend registration payload, persists attempt before one remote POST, and issues bearer', async () => {
    const response = await request(serverOf(app))
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    expect(typeof tokenOf(response)).toBe('string');
    expect(gateway.registerCalls).toBe(1);
    const [account] = await app
      .get(DatabaseService)
      .getDataSource()
      .query<{ status: string }[]>('SELECT status FROM gateway_accounts');
    expect(account?.status).toBe('AWAITING_CREDENTIALS');
  });

  test('rejects connection without a valid bearer instead of accepting client tenant identity', async () => {
    await request(serverOf(app))
      .post('/api/v1/gateway-account/connect')
      .send({
        document: registration.document,
        password: 'gateway-password',
        merchantId: 'attacker'
      })
      .expect(400);
    await request(serverOf(app))
      .post('/api/v1/gateway-account/connect')
      .send({ document: registration.document, password: 'gateway-password' })
      .expect(401);
  });

  test('persists an unknown timeout result and never repeats the remote registration', async () => {
    gateway.registrationError = new LeraBoxTimeoutError('register-user');
    const timeoutInput = {
      ...registration,
      email: 'timeout-owner@example.test',
      document: '98765432100'
    };
    const before = gateway.registerCalls;
    await request(serverOf(app)).post('/api/v1/auth/register').send(timeoutInput).expect(201);
    const [account] = await app
      .get(DatabaseService)
      .getDataSource()
      .query<
        { status: string }[]
      >('SELECT status FROM gateway_accounts WHERE expected_document = ?', [timeoutInput.document]);
    expect(account?.status).toBe('GATEWAY_REGISTRATION_UNKNOWN');
    await request(serverOf(app)).post('/api/v1/auth/register').send(timeoutInput).expect(409);
    expect(gateway.registerCalls - before).toBe(1);
    delete gateway.registrationError;
  });

  test('derives tenant from bearer, verifies profile, encrypts secrets and never returns password', async () => {
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password, remember: false })
      .expect(200);
    const response = await request(serverOf(app))
      .post('/api/v1/gateway-account/connect')
      .set('Authorization', `Bearer ${tokenOf(login)}`)
      .send({ document: registration.document, password: 'gateway-password' })
      .expect(200);
    expect(response.body as unknown).toEqual({ status: 'ACTIVE' });
    expect(JSON.stringify(response.body as unknown)).not.toContain('gateway-password');
    const [row] = await app
      .get(DatabaseService)
      .getDataSource()
      .query<
        Record<string, unknown>[]
      >('SELECT access_token_ciphertext, chave_loja_ciphertext FROM gateway_accounts');
    expect(JSON.stringify(row)).not.toContain('gateway-access-secret');
    expect(JSON.stringify(row)).not.toContain('gateway-store-secret');
  });

  test('profile mismatch remains inactive and returns a stable safe problem', async () => {
    await app
      .get(DatabaseService)
      .getDataSource()
      .query("UPDATE gateway_accounts SET status='AWAITING_CREDENTIALS', gateway_user_id=NULL");
    gateway.mismatch = true;
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password, remember: false });
    const response = await request(serverOf(app))
      .post('/api/v1/gateway-account/connect')
      .set('Authorization', `Bearer ${tokenOf(login)}`)
      .send({ document: registration.document, password: 'one-time-secret' })
      .expect(409);
    expect(response.body as unknown).toMatchObject({ code: 'GATEWAY_PROFILE_MISMATCH' });
    expect(JSON.stringify(response.body as unknown)).not.toContain('one-time-secret');
  });
});
