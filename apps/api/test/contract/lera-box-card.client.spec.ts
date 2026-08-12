import { LeraBoxCardClient } from '../../src/integrations/lera-box/payments/lera-box-card.client.js';

const input = {
  amountCents: '100',
  cardNumber: '4111111111111111',
  cardHolder: 'CONTRACT TEST',
  expiryMonth: 12,
  expiryYear: 2030,
  cvv: '123',
  installments: 3,
  feeBps: 319,
  description: 'Contract fixture',
  externalReference: 'REF-CARD-FIXTURE'
};
const response = {
  id: 'fixture-card-id',
  status: 'APPROVED',
  denialReason: null,
  externalReference: 'REF-CARD-FIXTURE',
  metadata: {
    cardBrand: 'VISA',
    cardLast4: '1111',
    installments: 3,
    feePercent: 3.19,
    feeAmountCents: 3,
    netAmountCents: 97
  }
};
function setup(body: unknown = response, status = 201) {
  const request = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  );
  return { request, client: new LeraBoxCardClient('https://gateway.test', request) };
}
function call(request: jest.MockedFunction<typeof fetch>) {
  const value = request.mock.calls[0];
  if (!value) throw new Error('CALL_MISSING');
  return value;
}
function body(request: jest.MockedFunction<typeof fetch>): string {
  const value = call(request)[1]?.body;
  if (typeof value !== 'string') throw new Error('BODY_MISSING');
  return value;
}
describe('LeraBoxCardClient', () => {
  test('posts exact card contract once', async () => {
    const { client, request } = setup();
    await client.create('access', input);
    expect(request).toHaveBeenCalledTimes(1);
    expect(call(request)[0]).toBe('https://gateway.test/api/payments/card');
    expect(JSON.parse(body(request))).toEqual({
      amount: 100,
      cardNumber: input.cardNumber,
      cardHolder: input.cardHolder,
      expiryMonth: 12,
      expiryYear: 2030,
      cvv: '123',
      installments: 3,
      feePercent: 3.19,
      description: input.description,
      externalReference: input.externalReference
    });
  });
  test('keeps bearer token outside payload', async () => {
    const { client, request } = setup();
    await client.create('access', input);
    expect(call(request)[1]?.headers).toMatchObject({ authorization: 'Bearer access' });
    expect(body(request)).not.toContain('access');
  });
  test('returns only allowlisted non-sensitive fields', async () => {
    const { client } = setup({
      ...response,
      metadata: { ...response.metadata, cardHolder: 'SECRET', expiryMonth: 12 },
      raw: input.cardNumber
    });
    const result = await client.create('access', input);
    expect(result).toEqual({
      gatewayPaymentId: 'fixture-card-id',
      status: 'APPROVED',
      externalReference: 'REF-CARD-FIXTURE',
      brand: 'VISA',
      last4: '1111',
      installments: 3,
      feeBps: 319,
      feeAmountCents: '3',
      netAmountCents: '97',
      denialReason: null
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|411111/u);
  });
  test.each([
    { ...response, status: 'UNKNOWN' },
    { ...response, metadata: {} },
    { ...response, metadata: { ...response.metadata, cardLast4: 'masked' } }
  ])('rejects malformed response %#', async (body) => {
    await expect(setup(body).client.create('access', input)).rejects.toMatchObject({
      code: 'LERA_BOX_MALFORMED_RESPONSE'
    });
  });
  test('rejects unsafe numeric cent conversion before fetch', async () => {
    const { client, request } = setup();
    await expect(
      client.create('access', { ...input, amountCents: '9007199254740992' })
    ).rejects.toMatchObject({ code: 'LERA_BOX_MALFORMED_RESPONSE' });
    expect(request).not.toHaveBeenCalled();
  });
  test('maps conclusive failure without request values', async () => {
    const { client } = setup({}, 400);
    const error = await client.create('access', input).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'LERA_BOX_CONCLUSIVE_FAILURE', remoteStatus: 400 });
    expect(String(error)).not.toMatch(/411111|CONTRACT TEST|123/u);
  });
});
