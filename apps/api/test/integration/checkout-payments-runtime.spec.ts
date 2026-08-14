import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { createApplicationDataSource } from '../../src/database/data-source.js';
import { DatabaseService } from '../../src/database/database.service.js';
import type { GatewayCardResult } from '../../src/integrations/lera-box/payments/lera-box-card.client.js';
import type { GatewayPixResult } from '../../src/integrations/lera-box/payments/lera-box-pix.client.js';
import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import {
  GATEWAY_CARD,
  GATEWAY_FEES,
  GATEWAY_PIX
} from '../../src/modules/payments/payments.module.js';
import {
  configureApplication,
  createOpenApiDocument
} from '../../src/platform/configure-application.js';

const owner = {
  email: 'checkout-runtime@example.test',
  password: 'StrongPassword123',
  legalName: 'Checkout Runtime Ltda',
  displayName: 'Checkout Runtime'
};
const fee = { id: 'fee-visa-1', brand: 'VISA' as const, installments: 1, feeBps: 299 };

describe('checkout and payments HTTP runtime', () => {
  let app: INestApplication;
  let bearer = '';
  const pix = {
    calls: 0,
    create: (): Promise<GatewayPixResult> => {
      pix.calls += 1;
      return Promise.resolve({
        gatewayPaymentId: 'pix-gateway-1',
        status: 'PENDING',
        externalReference: 'stub',
        txid: 'txid-1',
        emv: '000201stub',
        qrCodeBase64: 'cXItc3R1Yg==',
        denialReason: null
      });
    }
  };
  const card = {
    calls: 0,
    create: (): Promise<GatewayCardResult> => {
      card.calls += 1;
      return Promise.resolve({
        gatewayPaymentId: 'card-gateway-1',
        status: 'APPROVED',
        externalReference: 'stub',
        brand: 'VISA',
        last4: '1111',
        installments: 1,
        feeBps: 299,
        feeAmountCents: '299',
        netAmountCents: '9701',
        denialReason: null
      });
    }
  };

  beforeAll(async () => {
    process.env.DATABASE_HOST = process.env.MYSQL_TEST_HOST ?? '127.0.0.1';
    process.env.DATABASE_PORT = process.env.MYSQL_TEST_PORT ?? '33078';
    process.env.DATABASE_USER = process.env.MYSQL_TEST_USER ?? 'baas';
    process.env.DATABASE_PASSWORD = process.env.MYSQL_TEST_PASSWORD ?? 'baas-test-password';
    process.env.DATABASE_NAME = process.env.MYSQL_TEST_DATABASE ?? 'baas_test';
    process.env.AUTH_TOKEN_SECRET = 'test-auth-token-secret-at-least-32-bytes';
    process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
    process.env.LERA_BOX_BASE_URL = 'https://gateway.invalid';
    const bootstrap: DataSource = createApplicationDataSource();
    await bootstrap.initialize();
    await bootstrap.dropDatabase();
    await bootstrap.runMigrations({ transaction: 'each' });
    await bootstrap.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GATEWAY_FEES)
      .useValue({ list: () => Promise.resolve([fee]) })
      .overrideProvider(GATEWAY_PIX)
      .useValue(pix)
      .overrideProvider(GATEWAY_CARD)
      .useValue(card)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.get(DatabaseService).connect();
    await app.init();
    const registered = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);
    bearer = (registered.body as { accessToken: string }).accessToken;
    const principal = registered.body as { principal: { merchantId: string } };
    const accountId = '11111111-1111-4111-8111-111111111111';
    const encrypted = app
      .get(EncryptionService)
      .encrypt('gateway-access-token', principal.principal.merchantId, accountId, 'accessToken');
    await app
      .get(DatabaseService)
      .getDataSource()
      .query(
        `INSERT INTO gateway_accounts
       (id, merchant_id, status, expected_document, expected_person_type, access_token_ciphertext)
       VALUES (?, ?, 'ACTIVE', '12345678901', 'PF', ?)`,
        [accountId, principal.principal.merchantId, encrypted]
      );
  });

  afterAll(async () => app.close());

  test('publishes every executable checkout and payment boundary in Swagger', () => {
    const paths = Object.keys(createOpenApiDocument(app).paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/checkout-links',
        '/api/v1/checkout-links/{id}',
        '/api/v1/checkout-links/{id}/cancel',
        '/api/v1/public/checkout-sessions',
        '/api/v1/public/payments/pix',
        '/api/v1/public/payments/pix/{attemptId}',
        '/api/v1/public/payments/card/quote',
        '/api/v1/public/payments/card/confirm'
      ])
    );
  });

  test('derives merchant from bearer and persists an immutable checkout link', async () => {
    const created = await createLink('PIX_CARD', 'runtime-1');
    expect(created.body).toMatchObject({ publicReference: 'runtime-1', amountCents: '10000' });
    expect(typeof (created.body as { publicToken?: unknown }).publicToken).toBe('string');
    const listed = await request(app.getHttpServer() as Server)
      .get('/api/v1/checkout-links')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      total: 1,
      items: [{ publicReference: 'runtime-1' }],
      summary: { totalCount: 1, activeCount: 1 }
    });
    await request(app.getHttpServer() as Server)
      .get('/api/v1/checkout-links')
      .expect(401);
  });

  test('paginates and filters checkout links inside the authenticated tenant', async () => {
    await createLink('PIX', 'runtime-page-a');
    await createLink('CARD', 'runtime-page-b');

    const filtered = await request(app.getHttpServer() as Server)
      .get('/api/v1/checkout-links')
      .query({ search: 'page-b', method: 'CARD', status: 'ACTIVE', limit: 1, offset: 0 })
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);

    expect(filtered.body).toMatchObject({
      total: 1,
      items: [{ publicReference: 'runtime-page-b', allowedMethods: 'CARD' }]
    });
  });

  test('exchanges the fragment token once and enforces checkout cookie plus CSRF', async () => {
    const link = await createLink('PIX', 'runtime-session');
    const token = (link.body as { publicToken: string }).publicToken;
    const exchanged = await request(app.getHttpServer() as Server)
      .post('/api/v1/public/checkout-sessions')
      .send({ token })
      .expect(201);
    const cookies = exchanged.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.join(';')).toContain('__Host-baas_checkout=');
    expect(exchanged.headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer() as Server)
      .post('/api/v1/public/checkout-sessions')
      .send({ token })
      .expect(409);
    const cookie = checkoutCookie(exchanged);
    await request(app.getHttpServer() as Server)
      .post('/api/v1/public/payments/pix')
      .set('Cookie', cookie)
      .send({ payerDocument: '52998224725' })
      .expect(403);
  });

  test('submits Pix exactly once through the stub and persists only normalized output', async () => {
    const session = await publicSession('PIX', 'runtime-pix');
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/public/payments/pix')
      .set('Cookie', session.cookie)
      .set('x-csrf-token', session.csrfToken)
      .send({ payerDocument: '52998224725' })
      .expect(201);
    expect(response.body).toMatchObject({ status: 'PENDING', emv: '000201stub' });
    expect(pix.calls).toBe(1);
    const persisted = JSON.stringify(
      await app
        .get(DatabaseService)
        .getDataSource()
        .query('SELECT * FROM payment_attempts WHERE id = ?', [
          (response.body as { id: string }).id
        ])
    );
    expect(persisted).not.toContain('52998224725');
    expect(persisted).not.toContain('gateway-access-token');
  });

  test('quotes then confirms card without persisting PAN, CVV or holder', async () => {
    const session = await publicSession('CARD', 'runtime-card');
    const quote = await request(app.getHttpServer() as Server)
      .post('/api/v1/public/payments/card/quote')
      .set('Cookie', session.cookie)
      .set('x-csrf-token', session.csrfToken)
      .send({ brand: 'VISA', installments: 1 })
      .expect(201);
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/public/payments/card/confirm')
      .set('Cookie', session.cookie)
      .set('x-csrf-token', session.csrfToken)
      .send({
        quoteId: (quote.body as { quoteId: string }).quoteId,
        card: {
          number: '4111111111111111',
          holder: 'TEST OWNER',
          expiryMonth: 12,
          expiryYear: 2030,
          cvv: '123'
        }
      })
      .expect(201);
    expect(response.body).toMatchObject({ status: 'APPROVED', cardLast4: '1111' });
    expect(card.calls).toBe(1);
    const persisted = JSON.stringify(
      await app
        .get(DatabaseService)
        .getDataSource()
        .query('SELECT * FROM payment_attempts WHERE id = ?', [
          (response.body as { id: string }).id
        ])
    );
    expect(persisted).not.toContain('4111111111111111');
    expect(persisted).not.toContain('TEST OWNER');
    expect(persisted).not.toContain('123');
  });

  async function createLink(method: 'PIX' | 'CARD' | 'PIX_CARD', reference: string) {
    return request(app.getHttpServer() as Server)
      .post('/api/v1/checkout-links')
      .set('Authorization', `Bearer ${bearer}`)
      .send({
        publicReference: reference,
        description: `Pedido ${reference}`,
        amountCents: '10000',
        allowedMethods: method,
        maxInstallments: 1,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString()
      })
      .expect(201);
  }
  async function publicSession(method: 'PIX' | 'CARD', reference: string) {
    const link = await createLink(method, reference);
    const exchanged = await request(app.getHttpServer() as Server)
      .post('/api/v1/public/checkout-sessions')
      .send({ token: (link.body as { publicToken: string }).publicToken })
      .expect(201);
    return {
      cookie: checkoutCookie(exchanged),
      csrfToken: (exchanged.body as { csrfToken: string }).csrfToken
    };
  }
});

function checkoutCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const value = cookies?.find((cookie) => cookie.startsWith('__Host-baas_checkout='));
  if (!value) throw new Error('CHECKOUT_COOKIE_MISSING');
  return value.split(';')[0] ?? '';
}
