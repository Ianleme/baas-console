import {
  createAuthJourneyClient,
  createBaasMemorySession,
  createCardCheckoutClient,
  createCheckoutSessionClient,
  createPaymentLinksClient,
  createPixStatusClient
} from '@baas/api-client';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function requestBody(request: ReturnType<typeof vi.fn<typeof fetch>>, index: number): unknown {
  const body = request.mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('REQUEST_BODY_MISSING');
  return JSON.parse(body) as unknown;
}

describe('runtime API composition', () => {
  test('shares the login access token with authenticated same-origin requests', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ accessToken: 'access-token' }))
      .mockResolvedValueOnce(response([]));
    const session = createBaasMemorySession();
    const options = {
      baseUrl: '',
      fetch: request,
      accessToken: session.token,
      onAccessToken: session.setToken
    };

    await createAuthJourneyClient(options).login({
      email: 'owner@example.test',
      password: 'StrongPassword123',
      remember: true
    });
    await createPaymentLinksClient(options).list();

    expect(request.mock.calls[1]?.[0]).toBe('/api/v1/checkout-links');
    expect(request.mock.calls[1]?.[1]?.credentials).toBe('include');
    expect(new Headers(request.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  test('maps the payment-link view contract to the backend DTO and response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: 'link-1',
        publicReference: 'ORDER-1',
        description: 'Pedido',
        amountCents: '32000',
        allowedMethods: 'CARD',
        maxInstallments: 3,
        feeSnapshot: [{ id: 'fee', brand: 'VISA', installments: 3, feeBps: 319 }],
        status: 'ACTIVE',
        expiresAt: '2026-09-01T12:00:00.000Z',
        createdAt: '2026-08-12T12:00:00.000Z'
      })
    );

    const created = await createPaymentLinksClient({ baseUrl: '', fetch: request }).create({
      reference: 'ORDER-1',
      description: 'Pedido',
      amountCents: '32000',
      methods: 'CARD',
      maxInstallments: 3,
      selectedFeeBps: 319,
      expiresAt: '2026-09-01T12:00:00.000Z'
    });

    expect(requestBody(request, 0)).toEqual({
      publicReference: 'ORDER-1',
      description: 'Pedido',
      amountCents: '32000',
      allowedMethods: 'CARD',
      maxInstallments: 3,
      expiresAt: '2026-09-01T12:00:00.000Z'
    });
    expect(created).toEqual(
      expect.objectContaining({ reference: 'ORDER-1', methods: 'CARD', selectedFeeBps: 319 })
    );
  });

  test('propagates checkout CSRF and serializes Pix and nested card DTOs exactly', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ checkout: {}, csrfToken: 'csrf-token' }))
      .mockResolvedValueOnce(response({ id: 'pix-1', status: 'PENDING' }, 201))
      .mockResolvedValueOnce(response({ quoteId: 'quote-1' }, 201))
      .mockResolvedValueOnce(response({ status: 'APPROVED' }, 201));
    let csrfToken = '';
    const options = {
      baseUrl: '',
      fetch: request,
      csrfToken: () => csrfToken,
      onCsrfToken: (token: string) => {
        csrfToken = token;
      }
    };

    await createCheckoutSessionClient(options).exchange('x'.repeat(43));
    await createPixStatusClient(options).create({ payerDocument: '12345678901' });
    const card = createCardCheckoutClient(options);
    await card.quote({ amountCents: '32000', brand: 'VISA', installments: 3 });
    await card.confirm({
      quoteId: 'quote-1',
      cardNumber: '4111111111111111',
      cardHolder: 'CLIENTE SANDBOX',
      expiryMonth: 12,
      expiryYear: 2030,
      cvv: '123'
    });

    expect(
      request.mock.calls.slice(1).map((call) => new Headers(call[1]?.headers).get('x-csrf-token'))
    ).toEqual(['csrf-token', 'csrf-token', 'csrf-token']);
    expect(requestBody(request, 1)).toEqual({
      payerDocument: '12345678901'
    });
    expect(requestBody(request, 2)).toEqual({
      brand: 'VISA',
      installments: 3
    });
    expect(requestBody(request, 3)).toEqual({
      quoteId: 'quote-1',
      card: {
        number: '4111111111111111',
        holder: 'CLIENTE SANDBOX',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123'
      }
    });
  });
});
