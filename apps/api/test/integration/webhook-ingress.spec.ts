import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import { WebhookIngressController } from '../../src/modules/webhooks/ingress/webhook-ingress.controller.js';
import {
  WEBHOOK_MAX_BYTES,
  WebhookIngressError,
  WebhookIngressService,
  type IngressEndpoint,
  type IngressEvent,
  type WebhookIngressStore
} from '../../src/modules/webhooks/ingress/webhook-ingress.service.js';
import { configureApplication } from '../../src/platform/configure-application.js';

class MemoryStore implements WebhookIngressStore {
  endpoint: IngressEndpoint | undefined;
  events: IngressEvent[] = [];
  insertFailure = false;
  insert(event: IngressEvent) {
    if (this.insertFailure) return Promise.reject(new Error('database-secret'));
    this.events.push(event);
    return Promise.resolve();
  }
  findActiveEndpoint(publicEndpointId: string) {
    return Promise.resolve(
      this.endpoint?.publicEndpointId === publicEndpointId && this.endpoint.status === 'ACTIVE'
        ? this.endpoint
        : undefined
    );
  }
}

const encryption = new EncryptionService(Buffer.alloc(32, 7));
const now = new Date('2026-08-12T15:00:00.000Z');
const secret = 'fixture-secret';

function setup(eventType: IngressEndpoint['eventType'] = 'PAYMENT_PIX') {
  const store = new MemoryStore();
  store.endpoint = {
    id: 'endpoint-id',
    merchantId: 'merchant-a',
    publicEndpointId: 'opaque-endpoint',
    eventType,
    secretCiphertext: encryption.encrypt(secret, 'merchant-a', 'endpoint-id', 'webhook-secret'),
    status: 'ACTIVE'
  };
  return {
    store,
    service: new WebhookIngressService(
      store,
      encryption,
      () => now,
      () => 'event-id'
    )
  };
}

function payload(event = 'PAYMENT_PIX', status = 'APPROVED') {
  return Buffer.from(JSON.stringify({ event, id: 'gateway-event-id', status }), 'utf8');
}

function signature(rawBody: Buffer, key = secret) {
  return createHmac('sha256', key).update(rawBody).digest('hex');
}

describe('WebhookIngressService', () => {
  test.each(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'] as const)(
    'durably accepts a valid %s event',
    async (event) => {
      const { service, store } = setup(event);
      const rawBody = payload(event);
      await expect(
        service.receive({
          publicEndpointId: 'opaque-endpoint',
          rawBody,
          signature: signature(rawBody),
          eventHeader: event
        })
      ).resolves.toEqual({ status: 'RECEIVED' });
      expect(store.events).toHaveLength(1);
    }
  );

  test('accepts the transactionId field sent by Lera Box', async () => {
    const { service } = setup();
    const rawBody = Buffer.from(
      JSON.stringify({ event: 'PAYMENT_PIX', transactionId: 'gateway-event-id', status: 'APPROVED' })
    );
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody,
        signature: signature(rawBody),
        eventHeader: 'PAYMENT_PIX'
      })
    ).resolves.toEqual({ status: 'RECEIVED' });
  });

  test('signs exact raw bytes rather than parsed or normalized JSON', async () => {
    const { service, store } = setup();
    const signed = Buffer.from(
      '{"event":"PAYMENT_PIX", "id":"gateway-event-id","status":"APPROVED"}'
    );
    const normalized = payload();
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody: signed,
        signature: signature(normalized),
        eventHeader: 'PAYMENT_PIX'
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect(store.events).toEqual([]);
  });

  test.each([
    [undefined, 'missing'],
    ['A'.repeat(64), 'uppercase'],
    ['abc', 'short'],
    ['g'.repeat(64), 'non-hex'],
    [signature(payload(), 'wrong-secret'), 'wrong secret']
  ])('rejects %s signature (%s) without persistence', async (supplied) => {
    const { service, store } = setup();
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody: payload(),
        signature: supplied,
        eventHeader: 'PAYMENT_PIX'
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID', httpStatus: 401 });
    expect(store.events).toEqual([]);
  });

  test('rejects oversized payload before endpoint lookup or persistence', async () => {
    const { service, store } = setup();
    const rawBody = Buffer.alloc(WEBHOOK_MAX_BYTES + 1, 1);
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody,
        signature: signature(rawBody),
        eventHeader: 'PAYMENT_PIX'
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_PAYLOAD_TOO_LARGE', httpStatus: 413 });
    expect(store.events).toEqual([]);
  });

  test('accepts a payload exactly at the size limit after authentication', async () => {
    const { service, store } = setup();
    const rawBody = Buffer.alloc(WEBHOOK_MAX_BYTES, 32);
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody,
        signature: signature(rawBody),
        eventHeader: 'PAYMENT_PIX'
      })
    ).resolves.toEqual({ status: 'UNPROCESSABLE' });
    expect(store.events[0]?.status).toBe('UNPROCESSABLE');
  });

  test('returns unavailable and never acknowledges when durable insert fails', async () => {
    const { service, store } = setup();
    store.insertFailure = true;
    const rawBody = payload();
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody,
        signature: signature(rawBody),
        eventHeader: 'PAYMENT_PIX'
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_PERSISTENCE_UNAVAILABLE', httpStatus: 503 });
  });

  test.each([
    [Buffer.from('not-json'), 'PAYMENT_PIX'],
    [payload('UNKNOWN'), 'PAYMENT_PIX'],
    [payload('PAYMENT_PIX', 'PENDING'), 'PAYMENT_PIX'],
    [payload(), 'PAYMENT_CARD'],
    [Buffer.from('{"event":"PAYMENT_PIX","status":"APPROVED"}'), 'PAYMENT_PIX']
  ])('persists authenticated unknown payload %# as UNPROCESSABLE', async (rawBody, eventHeader) => {
    const { service, store } = setup();
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody,
        signature: signature(rawBody),
        eventHeader
      })
    ).resolves.toEqual({ status: 'UNPROCESSABLE' });
    expect(store.events[0]?.status).toBe('UNPROCESSABLE');
  });

  test('stores ciphertext, SHA-256 hash and safe signature metadata', async () => {
    const { service, store } = setup();
    const rawBody = payload();
    const supplied = signature(rawBody);
    await service.receive({
      publicEndpointId: 'opaque-endpoint',
      rawBody,
      signature: supplied,
      eventHeader: 'PAYMENT_PIX'
    });
    const event = store.events[0];
    expect(event?.rawBodyCiphertext.includes(rawBody)).toBe(false);
    expect(event?.rawBodyHash.toString('hex')).toBe(
      '858a111ff89c80f7a14ee1a3cf266a1f6b168497cd11a2bcd58c05247d967e96'
    );
    expect(event?.signatureMetadata).toEqual({
      algorithm: 'sha256',
      encoding: 'hex',
      event: 'PAYMENT_PIX'
    });
    expect(JSON.stringify(event)).not.toContain(supplied);
  });

  test('sets deterministic retry and 90-day retention timestamps only for processable input', async () => {
    const { service, store } = setup();
    const rawBody = payload();
    await service.receive({
      publicEndpointId: 'opaque-endpoint',
      rawBody,
      signature: signature(rawBody),
      eventHeader: 'PAYMENT_PIX'
    });
    expect(store.events[0]).toMatchObject({
      nextAttemptAt: now,
      receivedAt: now,
      purgeAfter: new Date('2026-11-10T15:00:00.000Z')
    });
  });

  test('hides missing and disabled opaque endpoints as not found', async () => {
    const { service, store } = setup();
    if (!store.endpoint) throw new Error('ENDPOINT_MISSING');
    store.endpoint.status = 'DISABLED';
    const rawBody = payload();
    await expect(
      service.receive({
        publicEndpointId: 'opaque-endpoint',
        rawBody,
        signature: signature(rawBody),
        eventHeader: 'PAYMENT_PIX'
      })
    ).rejects.toBeInstanceOf(WebhookIngressError);
    expect(store.events).toEqual([]);
  });
});

describe('raw webhook HTTP boundary', () => {
  let app: INestApplication;
  let store: MemoryStore;

  beforeEach(async () => {
    const state = setup();
    store = state.store;
    const module = await Test.createTestingModule({
      controllers: [WebhookIngressController],
      providers: [{ provide: WebhookIngressService, useValue: state.service }]
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());

  function server(): Server {
    return app.getHttpServer() as Server;
  }

  test('responds 200 only after a valid event is inserted', async () => {
    const rawBody = payload();
    const response = await request(server())
      .post('/api/v1/webhooks/opaque-endpoint')
      .set('content-type', 'application/json')
      .set('x-lera-box-event', 'PAYMENT_PIX')
      .set('x-lera-box-signature', signature(rawBody))
      .send(rawBody.toString('utf8'))
      .expect(200);
    expect(response.body as unknown).toEqual({ status: 'RECEIVED' });
    expect(store.events).toHaveLength(1);
  });

  test('rejects the obsolete generic webhook headers', async () => {
    const rawBody = payload();
    const response = await request(server())
      .post('/api/v1/webhooks/opaque-endpoint')
      .set('content-type', 'application/json')
      .set('x-webhook-event', 'PAYMENT_PIX')
      .set('x-webhook-signature', signature(rawBody))
      .send(rawBody.toString('utf8'))
      .expect(401);
    expect(response.body as unknown).toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect(store.events).toEqual([]);
  });

  test('returns 401 with no row for an invalid signature', async () => {
    const response = await request(server())
      .post('/api/v1/webhooks/opaque-endpoint')
      .set('content-type', 'application/json')
      .set('x-lera-box-event', 'PAYMENT_PIX')
      .set('x-lera-box-signature', '0'.repeat(64))
      .send(payload())
      .expect(401);
    expect(response.body as unknown).toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect(store.events).toEqual([]);
  });

  test('returns 503 and no false acknowledgement on database failure', async () => {
    store.insertFailure = true;
    const rawBody = payload();
    const response = await request(server())
      .post('/api/v1/webhooks/opaque-endpoint')
      .set('content-type', 'application/json')
      .set('x-lera-box-event', 'PAYMENT_PIX')
      .set('x-lera-box-signature', signature(rawBody))
      .send(rawBody.toString('utf8'))
      .expect(503);
    expect(response.body as unknown).toMatchObject({ code: 'WEBHOOK_PERSISTENCE_UNAVAILABLE' });
  });

  test('acknowledges authenticated unknown JSON as unprocessable', async () => {
    const rawBody = Buffer.from('{"unexpected":true}');
    const response = await request(server())
      .post('/api/v1/webhooks/opaque-endpoint')
      .set('content-type', 'application/json')
      .set('x-lera-box-event', 'PAYMENT_PIX')
      .set('x-lera-box-signature', signature(rawBody))
      .send(rawBody.toString('utf8'))
      .expect(200);
    expect(response.body as unknown).toEqual({ status: 'UNPROCESSABLE' });
    expect(store.events[0]?.status).toBe('UNPROCESSABLE');
  });
});
