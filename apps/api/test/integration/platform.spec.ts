import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import pino from 'pino';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/platform/configure-application.js';
import { HealthProbe } from '../../src/platform/health/health.probe.js';
import { PLATFORM_LOGGER } from '../../src/platform/logging/platform-logger.js';

class EchoDto {
  @IsString()
  @MinLength(3)
  value!: string;
}

@Controller('test')
class TestController {
  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('sensitive-internal-message');
  }

  @Get('resource/:id')
  resource(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

function createMemoryLogger() {
  const lines: string[] = [];
  const destination = { write: (line: string) => lines.push(line) };
  return { lines, logger: pino({ level: 'info' }, destination) };
}

interface HttpLog {
  correlationId?: string;
  event?: string;
  method?: string;
  route?: string;
  status?: number;
}

function serverOf(application: INestApplication): Server {
  return application.getHttpServer() as Server;
}

function parseLogs(lines: string[]): HttpLog[] {
  return lines.map((line) => JSON.parse(line) as HttpLog);
}

async function createApp({ ready = true } = {}) {
  const memory = createMemoryLogger();
  const moduleReference = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestController]
  })
    .overrideProvider(HealthProbe)
    .useValue({ checkReadiness: () => (ready ? undefined : 'SCHEMA_NOT_READY') })
    .overrideProvider(PLATFORM_LOGGER)
    .useValue(memory.logger)
    .compile();
  const app = moduleReference.createNestApplication();
  configureApplication(app);
  await app.init();
  return { app, logs: memory.lines };
}

describe('Nest platform boundary', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  test('serves Swagger UI at /docs', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app)).get('/docs').expect(HttpStatus.OK);
    expect(response.text).toContain('swagger-ui');
  });

  test('exports deterministic OpenAPI JSON', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app)).get('/docs-json').expect(HttpStatus.OK);
    const document = response.body as { info: unknown; paths: unknown };
    expect(document.info).toMatchObject({ title: 'BaaS Console API', version: '1.0' });
    expect(document.paths).toHaveProperty('/health/live');
  });

  test('reports liveness without checking external dependencies', async () => {
    ({ app } = await createApp({ ready: false }));
    const response = await request(serverOf(app)).get('/health/live').expect(HttpStatus.OK);
    expect(response.body as unknown).toEqual({ status: 'ok' });
  });

  test('reports readiness when the schema probe succeeds', async () => {
    ({ app } = await createApp({ ready: true }));
    const response = await request(serverOf(app)).get('/health/ready').expect(HttpStatus.OK);
    expect(response.body as unknown).toEqual({ status: 'ready' });
  });

  test('reports RFC 9457 readiness failure without exposing internals', async () => {
    ({ app } = await createApp({ ready: false }));
    const response = await request(serverOf(app))
      .get('/health/ready')
      .expect(HttpStatus.SERVICE_UNAVAILABLE);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
    expect(response.body as unknown).toMatchObject({ status: 503, code: 'SCHEMA_NOT_READY' });
    expect(response.body as unknown).toMatchObject({
      type: 'https://baas-console.invalid/problems/schema_not_ready',
      title: 'Service unavailable',
      detail: 'The database schema is not ready.',
      instance: '/health/ready'
    });
    expect(response.body as unknown).toHaveProperty('requestId');
  });

  test('rejects invalid DTOs with a stable validation problem', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app))
      .post('/test/echo')
      .send({ value: 'x' })
      .expect(HttpStatus.BAD_REQUEST);
    expect(response.body as unknown).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  test('rejects additional DTO properties', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app))
      .post('/test/echo')
      .send({ value: 'valid', unexpected: 'secret' })
      .expect(HttpStatus.BAD_REQUEST);
    expect(response.body as unknown).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  test('transforms and returns valid DTO payloads', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app))
      .post('/test/echo')
      .send({ value: 'valid' })
      .expect(HttpStatus.CREATED);
    expect(response.body as unknown).toEqual({ value: 'valid' });
  });

  test('returns a stable not-found problem', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app))
      .get('/does-not-exist')
      .expect(HttpStatus.NOT_FOUND);
    expect(response.body as unknown).toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('does not expose unexpected exception messages', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app))
      .get('/test/unexpected')
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.body as unknown).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(response.body as unknown)).not.toContain('sensitive-internal-message');
  });

  test('generates an internal UUID request id', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app)).get('/health/live').expect(HttpStatus.OK);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  test('does not trust a client value as the internal request id', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app))
      .get('/health/live')
      .set('x-request-id', 'attacker-controlled')
      .expect(HttpStatus.OK);
    expect(response.headers['x-request-id']).not.toBe('attacker-controlled');
  });

  test('accepts only a bounded safe correlation id', async () => {
    const state = await createApp();
    app = state.app;
    await request(serverOf(app))
      .get('/health/live')
      .set('x-correlation-id', 'safe-correlation_123')
      .expect(HttpStatus.OK);
    const log = parseLogs(state.logs).find((entry) => entry.event === 'http.response');
    expect(log.correlationId).toBe('safe-correlation_123');
  });

  test('drops malicious correlation input from logs', async () => {
    const state = await createApp();
    app = state.app;
    const malicious = 'token=super-secret-forged=true';
    await request(serverOf(app))
      .get('/health/live')
      .set('x-correlation-id', malicious)
      .expect(HttpStatus.OK);
    expect(state.logs.join('')).not.toContain('super-secret');
    expect(state.logs.join('')).not.toContain('forged=true');
  });

  test('logs only normalized route metadata and outcome', async () => {
    const state = await createApp();
    app = state.app;
    await request(serverOf(app)).get('/health/live?token=never-log-me').expect(HttpStatus.OK);
    const log = parseLogs(state.logs).find((entry) => entry.event === 'http.response');
    expect(log).toMatchObject({ method: 'GET', route: '/health/live', status: 200 });
    expect(JSON.stringify(log)).not.toContain('never-log-me');
  });

  test('logs a route template instead of a resource identifier', async () => {
    const state = await createApp();
    app = state.app;
    await request(serverOf(app)).get('/test/resource/sensitive-id').expect(HttpStatus.OK);
    const log = parseLogs(state.logs).find((entry) => entry.event === 'http.response');
    expect(log?.route).toBe('/test/resource/:id');
    expect(JSON.stringify(log)).not.toContain('sensitive-id');
  });

  test('sets baseline security response headers', async () => {
    ({ app } = await createApp());
    const response = await request(serverOf(app)).get('/health/live').expect(HttpStatus.OK);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
