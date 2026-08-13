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

  test('refreshes once after a 401 and returns the retried response with the new token', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([], 401))
      .mockResolvedValueOnce(response({ accessToken: 'refreshed-token', csrfToken: 'csrf-2' }))
      .mockResolvedValueOnce(response([{ id: 'link-1', feeSnapshot: [], maxInstallments: 1 }]));
    const session = createBaasMemorySession();
    session.setToken('expired-token');
    const client = createPaymentLinksClient({
      baseUrl: '', fetch: request, accessToken: session.token, onAccessToken: session.setToken
    });
    await expect(client.list()).resolves.toEqual([{ id: 'link-1', reference: undefined, description: undefined, amountCents: undefined, methods: undefined, maxInstallments: 1, selectedFeeBps: null, status: undefined, expiresAt: undefined }]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(new Headers(request.mock.calls[2]?.[1]?.headers).get('authorization')).toBe('Bearer refreshed-token');
  });

  test('cleans up once when refresh fails or the retry is still unauthorized', async () => {
    const onUnauthenticated = vi.fn();
    const refreshFails = vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({}, 401));
    const first = createPaymentLinksClient({ baseUrl: '', fetch: refreshFails, accessToken: () => 'token', onUnauthenticated });
    await expect(first.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(refreshFails).toHaveBeenCalledTimes(2);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);

    const retryFails = vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({ accessToken: 'new' })).mockResolvedValueOnce(response({}, 401));
    const terminal = createPaymentLinksClient({ baseUrl: '', fetch: retryFails, accessToken: () => 'token', onAccessToken: () => undefined, onUnauthenticated: vi.fn() });
    await expect(terminal.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(retryFails).toHaveBeenCalledTimes(3);
  });

  test('does not refresh non-401 errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({}, 500));
    const client = createPaymentLinksClient({ baseUrl: '', fetch: request, accessToken: () => 'token' });
    await expect(client.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('shares one refresh across concurrent unauthorized requests', async () => {
    let releaseRefresh!: () => void;
    const refreshPending = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 401))
      .mockImplementationOnce(async () => { await refreshPending; return response({ accessToken: 'shared-token' }); })
      .mockResolvedValueOnce(response([{ id: 'a', feeSnapshot: [], maxInstallments: 1 }]))
      .mockResolvedValueOnce(response([{ id: 'b', feeSnapshot: [], maxInstallments: 1 }]));
    const client = createPaymentLinksClient({ baseUrl: '', fetch: request, accessToken: () => 'old', onAccessToken: () => undefined });
    const first = client.list();
    const second = client.list();
    await Promise.resolve();
    releaseRefresh();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(5);
  });
});
