import { LeraBoxPixClient } from '../../src/integrations/lera-box/payments/lera-box-pix.client.js';

const input = {
  amountCents: '100',
  payerDocument: '52998224725',
  description: 'Contract fixture',
  externalReference: 'REF-PIX-FIXTURE'
};
const response = {
  id: 'fixture-pix-id',
  type: 'PIX',
  status: 'DENIED',
  denialReason: 'INSUFFICIENT_BALANCE',
  amount: 100,
  description: 'Contract fixture',
  metadata: { externalReference: 'REF-PIX-FIXTURE', txid: 'fixture-txid' },
  externalReference: 'REF-PIX-FIXTURE'
};
function setup(body: unknown = response, status = 201) {
  const request = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  );
  return { request, client: new LeraBoxPixClient('https://gateway.test', request) };
}
function requestCall(
  request: jest.MockedFunction<typeof fetch>
): [string | URL | Request, RequestInit] {
  const call = request.mock.calls[0];
  if (!call) throw new Error('REQUEST_CALL_MISSING');
  return [call[0], call[1] ?? {}];
}
function requestBody(init: RequestInit): string {
  if (typeof init.body !== 'string') throw new Error('REQUEST_BODY_MISSING');
  return init.body;
}
describe('LeraBoxPixClient', () => {
  test('posts exact integer cents and reconciliation fields', async () => {
    const { client, request } = setup();
    await client.create('access', input);
    const [, init] = requestCall(request);
    expect(JSON.parse(requestBody(init))).toEqual({
      amount: 100,
      payerDocument: '52998224725',
      description: 'Contract fixture',
      externalReference: 'REF-PIX-FIXTURE'
    });
  });
  test('uses the exact Pix endpoint once', async () => {
    const { client, request } = setup();
    await client.create('access', input);
    expect(request).toHaveBeenCalledTimes(1);
    expect(requestCall(request)[0]).toBe('https://gateway.test/api/payments/pix');
  });
  test('sends the bearer token outside the payload', async () => {
    const { client, request } = setup();
    await client.create('access', input);
    const [, init] = requestCall(request);
    expect(init.headers).toMatchObject({ authorization: 'Bearer access' });
    expect(requestBody(init)).not.toContain('access');
  });
  test('maps only allowlisted response fields', async () => {
    const { client } = setup({
      ...response,
      metadata: { ...response.metadata, chaveLoja: 'secret' },
      raw: 'secret'
    });
    const result = await client.create('access', input);
    expect(result).toEqual({
      gatewayPaymentId: 'fixture-pix-id',
      status: 'DENIED',
      externalReference: 'REF-PIX-FIXTURE',
      txid: 'fixture-txid',
      emv: null,
      qrCodeBase64: null,
      denialReason: 'INSUFFICIENT_BALANCE'
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  test('maps optional EMV and QR fields when present', async () => {
    const { client } = setup({ ...response, status: 'PENDING', emv: 'emv', qrCodeBase64: 'qr' });
    await expect(client.create('access', input)).resolves.toMatchObject({
      status: 'PENDING',
      emv: 'emv',
      qrCodeBase64: 'qr'
    });
  });
  test('accepts externalReference from metadata', async () => {
    const { client } = setup({ ...response, externalReference: undefined });
    await expect(client.create('access', input)).resolves.toMatchObject({
      externalReference: 'REF-PIX-FIXTURE'
    });
  });
  test('rejects malformed response states', async () => {
    const { client } = setup({ ...response, status: 'UNKNOWN' });
    await expect(client.create('access', input)).rejects.toMatchObject({
      code: 'LERA_BOX_MALFORMED_RESPONSE'
    });
  });
  test('rejects unsafe numeric cent conversion', async () => {
    const { client, request } = setup();
    await expect(
      client.create('access', { ...input, amountCents: '9007199254740992' })
    ).rejects.toMatchObject({ code: 'LERA_BOX_MALFORMED_RESPONSE' });
    expect(request).not.toHaveBeenCalled();
  });
  test('maps a non-201 response as conclusive dependency failure', async () => {
    const { client } = setup({}, 400);
    await expect(client.create('access', input)).rejects.toMatchObject({
      code: 'LERA_BOX_CONCLUSIVE_FAILURE',
      remoteStatus: 400
    });
  });
});
