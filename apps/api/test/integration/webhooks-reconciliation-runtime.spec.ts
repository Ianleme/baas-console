import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { createApplicationDataSource } from '../../src/database/data-source.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import {
  GATEWAY_RECONCILIATION,
  GATEWAY_WEBHOOKS
} from '../../src/modules/webhooks/webhooks.module.js';
import { WebhookProcessingService } from '../../src/modules/webhooks/processing/webhook-processing.service.js';
import {
  configureApplication,
  createOpenApiDocument
} from '../../src/platform/configure-application.js';

describe('durable webhooks and reconciliation HTTP runtime', () => {
  let app: INestApplication;
  let bearer = '';
  let merchantId = '';
  const webhookGateway = {
    create: jest.fn((_token: string, input: { event: 'PAYMENT_PIX'; url: string }) =>
      Promise.resolve({
        id: 'gateway-hook-1',
        event: input.event,
        url: input.url,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    ),
    delete: jest.fn(() => Promise.resolve())
  };
  const reconciliationGateway = {
    getPayment: jest.fn(() =>
      Promise.resolve({
        id: 'gateway-payment-1',
        externalReference: 'PIX-runtime-reconcile',
        amountCents: '10000',
        status: 'APPROVED' as const
      })
    ),
    getWithdrawal: jest.fn(),
    listStatement: jest.fn(() => Promise.resolve([]))
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
      .overrideProvider(GATEWAY_WEBHOOKS)
      .useValue(webhookGateway)
      .overrideProvider(GATEWAY_RECONCILIATION)
      .useValue(reconciliationGateway)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.get(DatabaseService).connect();
    await app.init();
    const registered = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        email: 'r4@example.test',
        password: 'StrongPassword123',
        legalName: 'R4 Merchant',
        displayName: 'R4'
      })
      .expect(201);
    const body = registered.body as { accessToken: string; principal: { merchantId: string } };
    bearer = body.accessToken;
    merchantId = body.principal.merchantId;
    const accountId = '22222222-2222-4222-8222-222222222222';
    const encrypted = app
      .get(EncryptionService)
      .encrypt('server-gateway-token', merchantId, accountId, 'accessToken');
    await app
      .get(DatabaseService)
      .getDataSource()
      .query(
        `INSERT INTO gateway_accounts
       (id, merchant_id, status, expected_document, expected_person_type, access_token_ciphertext)
       VALUES (?, ?, 'ACTIVE', '52998224725', 'PF', ?)`,
        [accountId, merchantId, encrypted]
      );
  });
  afterAll(async () => app.close());

  test('publishes webhook management, raw ingress and reconciliation in Swagger', () => {
    expect(Object.keys(createOpenApiDocument(app).paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/webhooks',
        '/api/v1/webhooks/configurations/{event}',
        '/api/v1/webhooks/{publicEndpointId}',
        '/api/v1/reconciliation',
        '/api/v1/reconciliation/{operationId}/verify'
      ])
    );
  });

  test('configures and lists a webhook from the bearer tenant without exposing secrets', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/v1/webhooks')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ event: 'PAYMENT_PIX' })
      .expect(201);
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/webhooks')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(response.body).toMatchObject([{ event: 'PAYMENT_PIX', status: 'ACTIVE' }]);
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(webhookGateway.create).toHaveBeenCalledWith('server-gateway-token', expect.anything());
  });

  test('authenticates exact raw bytes, persists before 200 and processes the projection once', async () => {
    const [endpoint] = await app.get(DatabaseService).getDataSource().query<
      {
        public_endpoint_id: string;
        id: string;
        secret_ciphertext: Buffer;
      }[]
    >('SELECT public_endpoint_id, id, secret_ciphertext FROM webhook_endpoints');
    if (!endpoint) throw new Error('WEBHOOK_ENDPOINT_MISSING');
    const secret = app
      .get(EncryptionService)
      .decrypt(endpoint.secret_ciphertext, merchantId, endpoint.id, 'webhook-secret');
    await seedPayment('runtime-webhook', 'gateway-webhook-payment');
    const raw = Buffer.from(
      JSON.stringify({ event: 'PAYMENT_PIX', id: 'gateway-webhook-payment', status: 'APPROVED' })
    );
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    await request(app.getHttpServer() as Server)
      .post(`/api/v1/webhooks/${endpoint.public_endpoint_id}`)
      .set('content-type', 'application/json')
      .set('x-webhook-event', 'PAYMENT_PIX')
      .set('x-webhook-signature', signature)
      .send(raw.toString('utf8'))
      .expect(200);
    await expect(app.get(WebhookProcessingService).run()).resolves.toBe(1);
    const [attempt] = await app
      .get(DatabaseService)
      .getDataSource()
      .query<
        { status: string }[]
      >('SELECT status FROM payment_attempts WHERE gateway_payment_id = ?', ['gateway-webhook-payment']);
    expect(attempt?.status).toBe('APPROVED');
  });

  test('reconciliation derives tenant and gateway token server-side and rejects client outcomes', async () => {
    const operationId = await seedPayment('runtime-reconcile', 'gateway-payment-1');
    await request(app.getHttpServer() as Server)
      .post(`/api/v1/reconciliation/${operationId}/verify`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ status: 'APPROVED' })
      .expect(400);
    const response = await request(app.getHttpServer() as Server)
      .post(`/api/v1/reconciliation/${operationId}/verify`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({})
      .expect(200);
    expect(response.body).toEqual({ classification: 'MATCHED' });
    expect(reconciliationGateway.getPayment).toHaveBeenCalledWith(
      'server-gateway-token',
      'gateway-payment-1'
    );
  });

  async function seedPayment(reference: string, gatewayId: string): Promise<string> {
    const id = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    await app
      .get(DatabaseService)
      .getDataSource()
      .query(
        `INSERT INTO checkout_links (id, merchant_id, public_reference, description, amount_cents,
       allowed_methods, max_installments, status, expires_at, public_token_hash,
       public_token_ciphertext) VALUES (?, ?, ?, 'Runtime', 10000, 'PIX', 1, 'ACTIVE',
       DATE_ADD(NOW(), INTERVAL 1 HOUR), UNHEX(SHA2(?,256)), X'01')`,
        [linkId, merchantId, reference, reference]
      );
    await app
      .get(DatabaseService)
      .getDataSource()
      .query(
        `INSERT INTO payment_attempts (id, merchant_id, checkout_link_id, method, status,
       external_reference, gateway_payment_id, installments, fee_bps, gross_amount_cents,
       fee_amount_cents, net_amount_cents) VALUES (?, ?, ?, 'PIX', 'RECONCILIATION_PENDING',
       ?, ?, 1, 0, 10000, 0, 10000)`,
        [id, merchantId, linkId, `PIX-${reference}`, gatewayId]
      );
    return id;
  }
});
