import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DemoModule } from '../../src/modules/demo/demo.module.js';
import { configureApplication } from '../../src/platform/configure-application.js';

describe('read-only demo HTTP boundary', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.DEMO_ENABLED = 'true';
    const module = await Test.createTestingModule({ imports: [DemoModule] }).compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.init();
    token = (
      await request(app.getHttpServer())
        .post('/api/v1/demo/session')
        .set('X-Forwarded-For', '198.51.100.1')
        .expect(200)
    ).body.accessToken as string;
  });

  afterAll(async () => {
    delete process.env.DEMO_ENABLED;
    await app?.close();
  });

  test('issues a fixed short session without a password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/demo/session')
      .set('X-Forwarded-For', '198.51.100.2')
      .expect(200);
    expect(response.body.principal).toEqual(
      expect.objectContaining({ demo: true, merchantId: '00000000-0000-4000-8000-000000000043' })
    );
    expect(response.body.principal.exp).toBeGreaterThan(Date.now());
    expect(JSON.stringify(response.body)).not.toMatch(/password|senha/iu);
  });

  test('serves the fixed demo read model', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/demo/view')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({
      merchant: { displayName: 'Demo Aurora Store' },
      balanceCents: '125000',
      mode: 'READ_ONLY'
    });
  });

  test.each([
    '/api/v1/payments',
    '/api/v1/withdrawals',
    '/api/v1/auth/logout',
    '/api/v1/checkout-links'
  ])('denies %s mutations with stable code', async (path) => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('DEMO_READ_ONLY');
  });

  test.each(['PUT', 'PATCH', 'DELETE'])('denies %s mutations too', async (method) => {
    const agent = request(app.getHttpServer());
    const response = await (
      method === 'PUT'
        ? agent.put('/api/v1/withdrawals/1')
        : method === 'PATCH'
          ? agent.patch('/api/v1/withdrawals/1')
          : agent.delete('/api/v1/withdrawals/1')
    ).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('DEMO_READ_ONLY');
  });

  test('does not deny unauthenticated normal requests as demo', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .send({ amount: 100 });
    expect(response.status).not.toBe(403);
    expect(response.body.code).not.toBe('DEMO_READ_ONLY');
  });

  test('allows an authenticated demo GET without mutation', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/demo/view')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.mode).toBe('READ_ONLY');
  });

  test('rate limits six session issues from one IP', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/demo/session')
          .set('X-Forwarded-For', '198.51.100.43')
      )
    );
    expect(responses.at(-1)?.status).toBe(429);
    expect(responses.at(-1)?.body.code).toBe('RATE_LIMITED');
  });

  test('rejects disabled demo entry', async () => {
    delete process.env.DEMO_ENABLED;
    const response = await request(app.getHttpServer())
      .post('/api/v1/demo/session')
      .set('X-Forwarded-For', '198.51.100.99')
      .expect(404);
    expect(response.body.code).toBe('DEMO_DISABLED');
    process.env.DEMO_ENABLED = 'true';
  });
});
