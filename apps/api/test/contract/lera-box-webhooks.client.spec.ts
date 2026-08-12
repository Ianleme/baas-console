import { LeraBoxWebhooksClient } from '../../src/integrations/lera-box/webhooks/lera-box-webhooks.client.js';

const webhook = {
  id: 'gateway-webhook-id',
  event: 'PAYMENT_PIX',
  url: 'https://callback.test/api/v1/webhooks/opaque',
  hasSecret: true,
  active: true,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z'
};

function setup(body: unknown = webhook, status = 201) {
  const request = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  );
  return { request, client: new LeraBoxWebhooksClient('https://gateway.test', request) };
}

function call(request: jest.MockedFunction<typeof fetch>): [string, RequestInit] {
  const requestCall = request.mock.calls[0];
  if (!requestCall) throw new Error('REQUEST_CALL_MISSING');
  const target = requestCall[0];
  if (typeof target !== 'string' && !(target instanceof URL))
    throw new Error('REQUEST_TARGET_INVALID');
  return [target.toString(), requestCall[1] ?? {}];
}

function body(init: RequestInit): string {
  if (typeof init.body !== 'string') throw new Error('REQUEST_BODY_MISSING');
  return init.body;
}

describe('LeraBoxWebhooksClient', () => {
  test.each(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'] as const)(
    'creates the %s callback using the documented body',
    async (event) => {
      const { client, request } = setup({ ...webhook, event });
      await client.create('access-token', {
        event,
        url: 'https://callback.test/api/v1/webhooks/opaque',
        secret: 'own-secret'
      });
      expect(JSON.parse(body(call(request)[1]))).toEqual({
        event,
        url: 'https://callback.test/api/v1/webhooks/opaque',
        secret: 'own-secret'
      });
    }
  );

  test('uses bearer authentication without placing the token in the body', async () => {
    const { client, request } = setup();
    await client.create('access-token', {
      event: 'PAYMENT_PIX',
      url: webhook.url,
      secret: 'own-secret'
    });
    expect(call(request)[1].headers).toMatchObject({ authorization: 'Bearer access-token' });
    expect(body(call(request)[1])).not.toContain('access-token');
  });

  test('maps only allowlisted create response fields', async () => {
    const { client } = setup({ ...webhook, secret: 'must-not-return', headers: 'must-not-return' });
    const result = await client.create('access-token', {
      event: 'PAYMENT_PIX',
      url: webhook.url,
      secret: 'own-secret'
    });
    expect(result).toEqual({
      id: webhook.id,
      event: 'PAYMENT_PIX',
      url: webhook.url,
      active: true,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt
    });
    expect(JSON.stringify(result)).not.toContain('must-not-return');
  });

  test('lists configured callbacks without exposing secret metadata', async () => {
    const { client } = setup([{ ...webhook, secret: 'must-not-return' }], 200);
    const result = await client.list('access-token');
    expect(result).toEqual([
      {
        id: webhook.id,
        event: 'PAYMENT_PIX',
        url: webhook.url,
        active: true,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt
      }
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-return');
  });

  test('deletes an encoded gateway webhook identifier', async () => {
    const { client, request } = setup({ deleted: true }, 200);
    await client.delete('access-token', 'gateway/id');
    expect(call(request)[0]).toBe('https://gateway.test/api/webhooks/gateway%2Fid');
    expect(call(request)[1].method).toBe('DELETE');
  });

  test('rejects malformed callback responses', async () => {
    const { client } = setup({ ...webhook, event: 'UNSUPPORTED' });
    await expect(
      client.create('access-token', {
        event: 'PAYMENT_PIX',
        url: webhook.url,
        secret: 'own-secret'
      })
    ).rejects.toMatchObject({ code: 'LERA_BOX_MALFORMED_RESPONSE' });
  });

  test('rejects a delete acknowledgement that is not conclusive', async () => {
    const { client } = setup({ deleted: false }, 200);
    await expect(client.delete('access-token', 'gateway-id')).rejects.toMatchObject({
      code: 'LERA_BOX_MALFORMED_RESPONSE'
    });
  });
});
