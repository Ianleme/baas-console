import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  ReconciliationController,
  type ReconciliationPrincipalProvider,
  type ReconciliationQuery
} from '../../src/modules/reconciliation/reconciliation.controller.js';
import {
  ReconciliationError,
  ReconciliationService
} from '../../src/modules/reconciliation/reconciliation.service.js';
import { configureApplication } from '../../src/platform/configure-application.js';

const rows = [
  {
    id: 'operation-a',
    kind: 'PAYMENT',
    reference: 'REF-1',
    status: 'RECONCILIATION_PENDING',
    classification: 'LOCAL_ONLY',
    updatedAt: '2026-08-12T16:00:00.000Z'
  }
];

describe('ReconciliationController', () => {
  let app: INestApplication;
  const reconciliation = { verify: jest.fn().mockResolvedValue('MATCHED') };
  const query: jest.Mocked<ReconciliationQuery> = { list: jest.fn().mockResolvedValue(rows) };
  const principal: ReconciliationPrincipalProvider = {
    current: () => ({ merchantId: 'merchant-a', gatewayAccessToken: 'server-access' })
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ReconciliationController],
      providers: [
        { provide: ReconciliationService, useValue: reconciliation },
        { provide: 'ReconciliationQuery', useValue: query },
        { provide: 'ReconciliationPrincipalProvider', useValue: principal }
      ]
    })
      .overrideProvider('ReconciliationQuery')
      .useValue(query)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => app.close());
  function server(): Server {
    return app.getHttpServer() as Server;
  }

  test('lists pending and divergent operations scoped to the session tenant', async () => {
    const response = await request(server()).get('/api/v1/reconciliation').expect(200);
    expect(response.body as unknown).toEqual(rows);
    expect(query.list).toHaveBeenCalledWith('merchant-a');
  });
  test('manual trigger derives tenant and gateway access from the server-side principal', async () => {
    const response = await request(server())
      .post('/api/v1/reconciliation/operation-a/verify')
      .expect(200);
    expect(response.body as unknown).toEqual({ classification: 'MATCHED' });
    expect(reconciliation.verify).toHaveBeenCalledWith(
      'merchant-a',
      'operation-a',
      'server-access'
    );
  });
  test.each(['status', 'effect', 'amountCents'])(
    'rejects forbidden manual field %s',
    async (field) => {
      const response = await request(server())
        .post('/api/v1/reconciliation/operation-a/verify')
        .send({ [field]: 'APPROVED' })
        .expect(400);
      expect(response.body as unknown).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(reconciliation.verify).not.toHaveBeenCalled();
    }
  );
  test('hides missing or cross-tenant operation as 404', async () => {
    reconciliation.verify.mockRejectedValueOnce(new ReconciliationError('RESOURCE_NOT_FOUND'));
    const response = await request(server())
      .post('/api/v1/reconciliation/operation-a/verify')
      .expect(404);
    expect(response.body as unknown).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
  test('translates gateway outage to 503 without deleting local data', async () => {
    reconciliation.verify.mockRejectedValueOnce(new Error('LERA_BOX_CONNECTION_FAILED'));
    const response = await request(server())
      .post('/api/v1/reconciliation/operation-a/verify')
      .expect(503);
    expect(response.body as unknown).toMatchObject({ code: 'GATEWAY_UNAVAILABLE' });
    expect(query.list).not.toHaveBeenCalled();
  });
  test('does not expose a tenant-addressable reconciliation route', async () => {
    await request(server())
      .post('/api/v1/reconciliation/merchant-a/operation-a/verify')
      .expect(404);
    expect(reconciliation.verify).not.toHaveBeenCalled();
  });
});
