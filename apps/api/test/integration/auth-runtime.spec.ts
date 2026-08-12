import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { createApplicationDataSource } from '../../src/database/data-source.js';
import { DatabaseService } from '../../src/database/database.service.js';
import {
  configureApplication,
  createOpenApiDocument
} from '../../src/platform/configure-application.js';

const owner = {
  legalName: 'Loja Aurora Ltda',
  displayName: 'Loja Aurora',
  email: 'owner@example.test',
  password: 'StrongPassword123'
};

function cookieValue(setCookies: string[], name: string): string {
  const cookie = setCookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`COOKIE_MISSING: ${name}`);
  return cookie.split(';', 1)[0] ?? '';
}

function serverOf(application: INestApplication): Server {
  return application.getHttpServer() as Server;
}

function csrfOf(response: request.Response): string {
  const body = response.body as { csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string') throw new Error('CSRF_RESPONSE_MISSING');
  return body.csrfToken;
}

describe('authentication HTTP runtime', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_HOST = process.env.MYSQL_TEST_HOST ?? '127.0.0.1';
    process.env.DATABASE_PORT = process.env.MYSQL_TEST_PORT ?? '33078';
    process.env.DATABASE_USER = process.env.MYSQL_TEST_USER ?? 'baas';
    process.env.DATABASE_PASSWORD = process.env.MYSQL_TEST_PASSWORD ?? 'baas-test-password';
    process.env.DATABASE_NAME = process.env.MYSQL_TEST_DATABASE ?? 'baas_test';
    const bootstrap: DataSource = createApplicationDataSource();
    await bootstrap.initialize();
    await bootstrap.dropDatabase();
    await bootstrap.runMigrations({ transaction: 'each' });
    await bootstrap.destroy();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.get(DatabaseService).connect();
    await app.init();
  });

  afterAll(async () => app.close());

  test('publishes every local auth operation in OpenAPI', () => {
    const paths = Object.keys(createOpenApiDocument(app).paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/auth/logout-all'
      ])
    );
  });

  test('registers exactly one persistent merchant owner and rejects unknown fields', async () => {
    await request(serverOf(app)).post('/api/v1/auth/register').send(owner).expect(201);
    await request(serverOf(app))
      .post('/api/v1/auth/register')
      .send({ ...owner, email: 'second@example.test', tenantId: 'attacker-selected' })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/u);
    const database = app.get(DatabaseService).getDataSource();
    const [{ merchants, users }] = await database.query<[{ merchants: string; users: string }]>(
      'SELECT (SELECT COUNT(*) FROM merchants) merchants, (SELECT COUNT(*) FROM users) users'
    );
    expect({ merchants, users }).toEqual({ merchants: '1', users: '1' });
  });

  test('accepts remember, issues a 15-minute token, and sets secure host-only cookies', async () => {
    const response = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password, remember: true })
      .expect(200);
    const body = response.body as {
      accessToken?: unknown;
      csrfToken?: unknown;
      expiresIn?: unknown;
    };
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.csrfToken).toBe('string');
    expect(body.expiresIn).toBe(900);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^__Host-baas_refresh=.*HttpOnly.*Secure.*SameSite=Strict/u),
        expect.stringMatching(/^__Host-baas_csrf=.*Secure.*SameSite=Strict/u)
      ])
    );
    expect(cookies.join(';')).not.toContain('Domain=');
  });

  test('returns stable RFC problem details for invalid credentials', async () => {
    const response = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'WrongPassword123', remember: false })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/u);
    expect(response.body as unknown).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(JSON.stringify(response.body as unknown)).not.toContain('WrongPassword123');
  });

  test('rotates refresh cookies with matching CSRF and rejects reuse', async () => {
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password, remember: false });
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const original = [
      cookieValue(cookies, '__Host-baas_refresh'),
      cookieValue(cookies, '__Host-baas_csrf')
    ];
    const rotated = await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', original)
      .set('X-CSRF-Token', csrfOf(login))
      .expect(200);
    expect(
      cookieValue(rotated.headers['set-cookie'] as unknown as string[], '__Host-baas_refresh')
    ).not.toBe(original[0]);
    await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', original)
      .set('X-CSRF-Token', csrfOf(login))
      .expect(401)
      .expect(({ body }) => {
        expect(body as unknown).toMatchObject({ code: 'SESSION_REUSE_DETECTED' });
      });
  });

  test('requires CSRF for cookie-authenticated operations', async () => {
    await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .expect(403)
      .expect(({ body }) => {
        expect(body as unknown).toMatchObject({ code: 'CSRF_INVALID' });
      });
  });

  test('logout revokes the current refresh session', async () => {
    const login = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password, remember: false });
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const requestCookies = [
      cookieValue(cookies, '__Host-baas_refresh'),
      cookieValue(cookies, '__Host-baas_csrf')
    ];
    await request(serverOf(app))
      .post('/api/v1/auth/logout')
      .set('Cookie', requestCookies)
      .set('X-CSRF-Token', csrfOf(login))
      .expect(204);
    await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', requestCookies)
      .set('X-CSRF-Token', csrfOf(login))
      .expect(401);
  });

  test('logout-all revokes every refresh session for the authenticated owner', async () => {
    const first = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password, remember: false });
    const second = await request(serverOf(app))
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password, remember: false });
    const firstCookies = first.headers['set-cookie'] as unknown as string[];
    const secondCookies = second.headers['set-cookie'] as unknown as string[];
    await request(serverOf(app))
      .post('/api/v1/auth/logout-all')
      .set('Cookie', [
        cookieValue(firstCookies, '__Host-baas_refresh'),
        cookieValue(firstCookies, '__Host-baas_csrf')
      ])
      .set('X-CSRF-Token', csrfOf(first))
      .expect(204);
    await request(serverOf(app))
      .post('/api/v1/auth/refresh')
      .set('Cookie', [
        cookieValue(secondCookies, '__Host-baas_refresh'),
        cookieValue(secondCookies, '__Host-baas_csrf')
      ])
      .set('X-CSRF-Token', csrfOf(second))
      .expect(401);
  });

  test('rate limits repeated login attempts with stable problem code and Retry-After', async () => {
    let response: request.Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(serverOf(app))
        .post('/api/v1/auth/login')
        .send({ email: 'limited@example.test', password: 'WrongPassword123', remember: false });
      if (response.status === 429) break;
    }
    expect(response?.status).toBe(429);
    expect(response?.headers['retry-after']).toBe('60');
    expect(response?.body as unknown).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
