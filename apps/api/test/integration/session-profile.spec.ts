import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { createApplicationDataSource } from '../../src/database/data-source.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { configureApplication } from '../../src/platform/configure-application.js';

const owner = {
  name: 'Owner Aurora',
  tradingName: 'Aurora Store',
  email: 'owner-a@example.test',
  password: 'StrongPassword123'
};

const httpServer = (app: INestApplication) => app.getHttpServer() as Parameters<typeof request>[0];

async function register(app: INestApplication, input: Record<string, unknown>) {
  const response = await request(httpServer(app)).post('/api/v1/auth/register').send(input);
  expect(response.status).toBe(201);
  return response.body as { accessToken: string };
}

describe('current session profile HTTP API', () => {
  let app: INestApplication;
  let database: DataSource;

  beforeAll(async () => {
    process.env.DATABASE_HOST = process.env.MYSQL_TEST_HOST ?? '127.0.0.1';
    process.env.DATABASE_PORT = process.env.MYSQL_TEST_PORT ?? '33078';
    process.env.DATABASE_USER = process.env.MYSQL_TEST_USER ?? 'baas';
    process.env.DATABASE_PASSWORD = process.env.MYSQL_TEST_PASSWORD ?? 'baas-test-password';
    process.env.DATABASE_NAME = process.env.MYSQL_TEST_DATABASE ?? 'baas_test';
    const bootstrap = createApplicationDataSource();
    await bootstrap.initialize();
    await bootstrap.dropDatabase();
    await bootstrap.runMigrations({ transaction: 'each' });
    await bootstrap.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.get(DatabaseService).connect();
    database = app.get(DatabaseService).getDataSource();
    await app.init();
  });

  afterAll(async () => app.close());

  test('returns the authenticated merchant and owner allowlist', async () => {
    const session = await register(app, owner);
    const response = await request(httpServer(app))
      .get('/api/v1/session/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const body = response.body as {
      merchant: unknown;
      owner: unknown;
      gatewayConnectionStatus: unknown;
    };
    expect(body).toEqual({
      merchant: { legalName: 'Owner Aurora', displayName: 'Aurora Store' },
      owner: { fullName: 'Owner Aurora', email: owner.email },
      gatewayConnectionStatus: null
    });
    expect(Object.keys(body)).toEqual(['merchant', 'owner', 'gatewayConnectionStatus']);
  });

  test('rejects missing and invalid access tokens', async () => {
    await request(httpServer(app)).get('/api/v1/session/profile').expect(401);
    await request(httpServer(app))
      .get('/api/v1/session/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  test('derives tenant identity from each token and ignores client tenant selectors', async () => {
    const second = await register(app, {
      ...owner,
      name: 'Owner Boreal',
      tradingName: 'Boreal Store',
      email: 'owner-b@example.test'
    });
    const response = await request(httpServer(app))
      .get('/api/v1/session/profile?merchantId=attacker-selected')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
    const body = response.body as { merchant: unknown; owner: unknown };
    expect(body.merchant).toEqual({
      legalName: 'Owner Boreal',
      displayName: 'Boreal Store'
    });
    expect(body.owner).toEqual({
      fullName: 'Owner Boreal',
      email: 'owner-b@example.test'
    });
    expect(JSON.stringify(response.body)).not.toContain('attacker-selected');
  });

  test('falls back to email for a legacy null full name', async () => {
    const session = await register(app, {
      ...owner,
      email: 'legacy@example.test',
      name: 'Legacy Owner',
      tradingName: 'Legacy Store'
    });
    await database.query('UPDATE users SET full_name = NULL WHERE email = ?', [
      'legacy@example.test'
    ]);
    const response = await request(httpServer(app))
      .get('/api/v1/session/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const body = response.body as { owner: unknown };
    expect(body.owner).toEqual({
      fullName: 'legacy@example.test',
      email: 'legacy@example.test'
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash|token|Id|secret/iu);
  });
});
