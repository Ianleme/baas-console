import { LeraBoxStub } from '@baas/test-support';

import { LeraBoxFeesClient } from '../../src/integrations/lera-box/fees/lera-box-fees.client.js';

describe('LeraBoxFeesClient contract', () => {
  let stub: LeraBoxStub;

  beforeEach(async () => {
    stub = new LeraBoxStub();
    await stub.start();
  });

  afterEach(async () => {
    await stub.stop();
  });

  it('maps the public fee collection to integer basis points', async () => {
    await expect(new LeraBoxFeesClient(stub.baseUrl).list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ brand: 'VISA', installments: 3, feeBps: 319 }),
        expect.objectContaining({ brand: 'MASTERCARD', installments: 1, feeBps: 269 }),
        expect.objectContaining({ brand: 'ELO', installments: 1, feeBps: 289 })
      ])
    );
  });

  it('serializes the optional brand query exactly', async () => {
    let requestedUrl = '';
    const request: typeof fetch = (input) => {
      requestedUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            total: 1,
            fees: [{ id: 'fee-visa-1', brand: 'VISA', installments: 1, feePercent: 2.49 }]
          }),
          { status: 200 }
        )
      );
    };
    const fees = await new LeraBoxFeesClient('https://gateway.invalid', request).list('VISA');
    expect(requestedUrl).toBe('https://gateway.invalid/api/fees?brand=VISA');
    expect(fees).toEqual([{ id: 'fee-visa-1', brand: 'VISA', installments: 1, feeBps: 249 }]);
  });

  it.each([
    [{ total: 1, fees: [{ id: 'x', brand: 'UNKNOWN', installments: 1, feePercent: 2.49 }] }],
    [{ total: 1, fees: [{ id: 'x', brand: 'VISA', installments: 0, feePercent: 2.49 }] }],
    [{ total: 1, fees: [{ id: 'x', brand: 'VISA', installments: 22, feePercent: 2.49 }] }],
    [{ total: 0, fees: [{ id: 'x', brand: 'VISA', installments: 1, feePercent: 2.49 }] }]
  ])('rejects malformed collection %#', async (body) => {
    const request: typeof fetch = () =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    await expect(
      new LeraBoxFeesClient('https://gateway.invalid', request).list()
    ).rejects.toMatchObject({
      code: 'LERA_BOX_MALFORMED_RESPONSE'
    });
  });
});
