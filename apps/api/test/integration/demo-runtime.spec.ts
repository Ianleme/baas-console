import { Controller, Delete, Patch, Post, Put, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DemoModule } from '../../src/modules/demo/demo.module.js';
import { configureApplication } from '../../src/platform/configure-application.js';

@Controller('api/v1')
class DummyMutationController {
  @Post('payments')
  payments() {
    return { ok: true };
  }
  @Post('withdrawals')
  withdrawals() {
    return { ok: true };
  }
  @Post('auth/logout')
  logout() {
    return { ok: true };
  }
  @Post('checkout-links')
  checkoutLinks() {
    return { ok: true };
  }
  @Put('withdrawals')
  putWithdrawals() {
    return { ok: true };
  }
  @Patch('withdrawals')
  patchWithdrawals() {
    return { ok: true };
  }
  @Delete('withdrawals')
  deleteWithdrawals() {
    return { ok: true };
  }
}

describe('read-only demo HTTP boundary', () => {
  let app: INestApplication;
  let token: string;

  const httpServer = () => app.getHttpServer() as Parameters<typeof request>[0];

  beforeAll(async () => {
    process.env.DEMO_ENABLED = 'true';
    const module = await Test.createTestingModule({
      imports: [DemoModule],
      controllers: [DummyMutationController]
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.init();
    const res = await request(httpServer())
      .post('/api/v1/demo/session')
      .set('X-Forwarded-For', '198.51.100.1')
      .expect(200);
    const body = res.body as { accessToken: string };
    token = body.accessToken;
  });

  afterAll(async () => {
    delete process.env.DEMO_ENABLED;
    if (app) await app.close();
  });

  test('issues a fixed short session without a password', async () => {
    const response = await request(httpServer())
      .post('/api/v1/demo/session')
      .set('X-Forwarded-For', '198.51.100.2')
      .expect(200);
    const body = response.body as { principal: { exp: number } };
    expect(body.principal).toEqual(
      expect.objectContaining({ demo: true, merchantId: '00000000-0000-4000-8000-000000000043' })
    );
    expect(body.principal.exp).toBeGreaterThan(Date.now());
    expect(JSON.stringify(response.body)).not.toMatch(/password|senha/iu);
  });

  test('serves the fixed demo read model', async () => {
    const response = await request(httpServer())
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
    const response = await request(httpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });
    const body = response.body as { code: string };
    expect(response.status).toBe(403);
    expect(body.code).toBe('DEMO_READ_ONLY');
  });

  test.each(['PUT', 'PATCH', 'DELETE'])('denies %s mutations too', async (method) => {
    const agent = request(httpServer());
    const response = await (
      method === 'PUT'
        ? agent.put('/api/v1/withdrawals')
        : method === 'PATCH'
          ? agent.patch('/api/v1/withdrawals')
          : agent.delete('/api/v1/withdrawals')
    ).set('Authorization', `Bearer ${token}`);
    const body = response.body as { code: string };
    expect(response.status).toBe(403);
    expect(body.code).toBe('DEMO_READ_ONLY');
  });

  test('does not deny unauthenticated normal requests as demo', async () => {
    const response = await request(httpServer()).post('/api/v1/payments').send({ amount: 100 });
    const body = response.body as { code?: string };
    expect(response.status).not.toBe(403);
    expect(body.code).not.toBe('DEMO_READ_ONLY');
  });

  test('allows an authenticated demo GET without mutation', async () => {
    const response = await request(httpServer())
      .get('/api/v1/demo/view')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as { mode: string };
    expect(body.mode).toBe('READ_ONLY');
  });

  test('rate limits six session issues from one IP', async () => {
    let lastRes;
    for (let i = 0; i < 6; i++) {
      lastRes = await request(httpServer())
        .post('/api/v1/demo/session')
        .set('X-Forwarded-For', '198.51.100.43');
    }
    const body = lastRes?.body as { code?: string } | undefined;
    expect(lastRes?.status).toBe(429);
    expect(body?.code).toBe('RATE_LIMITED');
  });

  test('rejects disabled demo entry', async () => {
    delete process.env.DEMO_ENABLED;
    const response = await request(httpServer())
      .post('/api/v1/demo/session')
      .set('X-Forwarded-For', '198.51.100.99')
      .expect(404);
    const body = response.body as { code: string };
    expect(body.code).toBe('DEMO_DISABLED');
    process.env.DEMO_ENABLED = 'true';
  });
});
