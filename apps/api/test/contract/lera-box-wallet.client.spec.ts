import { LeraBoxWalletClient } from '../../src/integrations/lera-box/wallet/lera-box-wallet.client.js';

function setup(body: unknown, status = 200) {
  const request = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  );
  return { request, client: new LeraBoxWalletClient('https://gateway.test', request) };
}

function captured(request: jest.MockedFunction<typeof fetch>) {
  const call = request.mock.calls[0];
  if (!call) throw new Error('REQUEST_MISSING');
  const target = call[0];
  if (typeof target !== 'string' && !(target instanceof URL)) throw new Error('REQUEST_INVALID');
  return { url: target.toString(), init: call[1] ?? {} };
}

describe('LeraBoxWalletClient', () => {
  const wallet = {
    id: 'wallet-1',
    balance: 97,
    updatedAt: '2026-08-12T00:00:00.000Z',
    balanceFormatted: 'R$ 0,97',
    secret: 'must-not-return'
  };

  test('reads the confirmed wallet route with bearer authentication and no body', async () => {
    const { client, request } = setup(wallet);
    await client.getWallet('server-token');
    expect(captured(request).url).toBe('https://gateway.test/api/wallet');
    expect(captured(request).init.headers).toEqual({ authorization: 'Bearer server-token' });
    expect(captured(request).init.method).toBeUndefined();
    expect(captured(request).init.body).toBeUndefined();
  });

  test('maps cents, UTC timestamp and opaque source id exactly', async () => {
    const { client } = setup(wallet);
    await expect(client.getWallet('access')).resolves.toEqual({
      balanceCents: '97',
      capturedAt: new Date('2026-08-12T00:00:00.000Z'),
      sourceRequestId: 'wallet-1'
    });
  });

  test('accepts zero without fabricating a different balance', async () => {
    const { client } = setup({ ...wallet, balance: 0 });
    await expect(client.getWallet('access')).resolves.toMatchObject({ balanceCents: '0' });
  });

  test('maps an omitted source id to null', async () => {
    const { client } = setup({ balance: 97, updatedAt: wallet.updatedAt });
    await expect(client.getWallet('access')).resolves.toMatchObject({ sourceRequestId: null });
  });

  test.each([
    { ...wallet, balance: -1 },
    { ...wallet, balance: 1.5 },
    { ...wallet, balance: Number.MAX_SAFE_INTEGER + 1 },
    { ...wallet, balance: '97' },
    { ...wallet, updatedAt: 'not-a-date' },
    { ...wallet, id: 123 }
  ])('rejects malformed wallet response %#', async (body) => {
    const { client } = setup(body);
    await expect(client.getWallet('access')).rejects.toMatchObject({
      code: 'LERA_BOX_MALFORMED_RESPONSE'
    });
  });

  test('maps dependency failure without exposing its response body', async () => {
    const { client } = setup({ accessToken: 'must-not-leak' }, 503);
    await expect(client.getWallet('access')).rejects.toMatchObject({
      code: 'LERA_BOX_CONCLUSIVE_FAILURE',
      remoteStatus: 503
    });
  });
});
