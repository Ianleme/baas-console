import { LeraBoxReconciliationClient } from '../../src/integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';

const record = {
  id: 'gateway-id',
  status: 'APPROVED',
  amount: 100,
  externalReference: 'REF-1',
  metadata: { secret: 'must-not-return' }
};

function setup(body: unknown = record, status = 200) {
  const request = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  );
  return { request, client: new LeraBoxReconciliationClient('https://gateway.test', request) };
}

function call(request: jest.MockedFunction<typeof fetch>) {
  const value = request.mock.calls[0];
  if (!value) throw new Error('REQUEST_MISSING');
  const target = value[0];
  if (typeof target !== 'string' && !(target instanceof URL)) throw new Error('REQUEST_INVALID');
  return { url: target.toString(), init: value[1] ?? {} };
}

describe('LeraBoxReconciliationClient', () => {
  test('reads a payment by encoded id using GET only', async () => {
    const { client, request } = setup();
    await client.getPayment('access', 'payment/id');
    expect(call(request).url).toBe('https://gateway.test/api/payments/payment%2Fid');
    expect(call(request).init.method).toBeUndefined();
  });
  test('reads a withdrawal by encoded id using GET only', async () => {
    const { client, request } = setup();
    await client.getWithdrawal('access', 'withdrawal/id');
    expect(call(request).url).toBe('https://gateway.test/api/withdrawals/withdrawal%2Fid');
    expect(call(request).init.method).toBeUndefined();
  });
  test('lists the remote statement using GET only', async () => {
    const { client, request } = setup({ transactions: [record] });
    await client.listStatement('access');
    expect(call(request).url).toBe('https://gateway.test/api/wallet/transactions');
    expect(call(request).init.method).toBeUndefined();
  });
  test('uses bearer auth without request body', async () => {
    const { client, request } = setup();
    await client.getPayment('access', 'id');
    expect(call(request).init.headers).toMatchObject({ authorization: 'Bearer access' });
    expect(call(request).init.body).toBeUndefined();
  });
  test.each(['APPROVED', 'DENIED', 'PENDING', 'EXPIRED'] as const)(
    'maps remote status %s',
    async (status) => {
      const { client } = setup({ ...record, status });
      await expect(client.getPayment('access', 'id')).resolves.toEqual({
        id: 'gateway-id',
        status,
        amountCents: '100',
        externalReference: 'REF-1'
      });
    }
  );
  test('accepts externalReference from metadata', async () => {
    const { client } = setup({
      ...record,
      externalReference: undefined,
      metadata: { externalReference: 'REF-META' }
    });
    await expect(client.getPayment('access', 'id')).resolves.toMatchObject({
      externalReference: 'REF-META'
    });
  });
  test.each([
    [{ ...record, status: 'UNKNOWN' }],
    [{ ...record, amount: 1.5 }],
    [{ ...record, id: null }],
    [{ transactions: {} }]
  ])('rejects malformed read response %#', async (body) => {
    const { client } = setup(body);
    const operation =
      'transactions' in body ? client.listStatement('access') : client.getPayment('access', 'id');
    await expect(operation).rejects.toMatchObject({ code: 'LERA_BOX_MALFORMED_RESPONSE' });
  });
  test('maps dependency failure without exposing its body', async () => {
    const { client } = setup({ secret: 'raw' }, 503);
    await expect(client.getPayment('access', 'id')).rejects.toMatchObject({
      code: 'LERA_BOX_CONCLUSIVE_FAILURE',
      remoteStatus: 503
    });
  });
});
