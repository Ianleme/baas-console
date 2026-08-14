import {
  createAuthJourneyClient,
  createBaasMemorySession,
  createCardCheckoutClient,
  createCheckoutSessionClient,
  createCurrentProfileClient,
  createDashboardClient,
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

const defaultPaymentLinksUrl = '/api/v1/checkout-links?limit=10&offset=0';

function paymentLinksPage(items: unknown[]) {
  return {
    items,
    total: items.length,
    summary: {
      totalCount: items.length,
      activeCount: 0,
      paidCount: 0,
      paidAmountCents: '0'
    }
  };
}

describe('runtime API composition', () => {
  test('shares the login access token with authenticated same-origin requests', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ accessToken: 'access-token' }))
      .mockResolvedValueOnce(
        response({
          items: [],
          total: 0,
          summary: { totalCount: 0, activeCount: 0, paidCount: 0, paidAmountCents: '0' }
        })
      );
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
    await createPaymentLinksClient(options).list({
      search: 'pedido',
      limit: 10,
      offset: 20
    });

    expect(request.mock.calls[1]?.[0]).toBe(
      '/api/v1/checkout-links?search=pedido&limit=10&offset=20'
    );
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

  test('issues a checkout share token only through the authenticated POST boundary', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ publicToken: 'sandbox-public-token' }));

    const result = await createPaymentLinksClient({
      baseUrl: '',
      fetch: request,
      accessToken: () => 'merchant-access-token'
    }).share('link/1');

    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/checkout-links/link%2F1/share');
    expect(request.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer merchant-access-token'
    );
    expect(result).toEqual({ publicToken: 'sandbox-public-token' });
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
      .mockResolvedValueOnce(
        response(paymentLinksPage([{ id: 'link-1', feeSnapshot: [], maxInstallments: 1 }]))
      );
    const session = createBaasMemorySession();
    session.setToken('expired-token');
    const onUnauthenticated = vi.fn();
    const client = createPaymentLinksClient({
      baseUrl: '',
      fetch: request,
      accessToken: session.token,
      onAccessToken: session.setToken,
      onUnauthenticated
    });
    await expect(client.list()).resolves.toMatchObject({ items: [{ id: 'link-1' }], total: 1 });
    expect(request.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
    expect(request.mock.calls.filter(([url]) => url === defaultPaymentLinksUrl)).toHaveLength(2);
    expect(request.mock.invocationCallOrder[1] ?? 0).toBeGreaterThan(
      request.mock.invocationCallOrder[0] ?? 0
    );
    expect(new Headers(request.mock.calls[2]?.[1]?.headers).get('authorization')).toBe(
      'Bearer refreshed-token'
    );
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(session.token()).toBe('refreshed-token');
  });

  test('refresh failure clears session and notifies once without another refresh', async () => {
    const session = createBaasMemorySession();
    session.setToken('token');
    const onUnauthenticated = vi.fn(() => {
      session.clear();
    });
    const refreshFails = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 401));
    const first = createPaymentLinksClient({
      baseUrl: '',
      fetch: refreshFails,
      accessToken: session.token,
      onUnauthenticated
    });
    await expect(first.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(session.token()).toBe('');
    expect(refreshFails.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(
      1
    );
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  test('retry 401 clears session and notifies once without a second refresh', async () => {
    const session = createBaasMemorySession();
    session.setToken('token');
    const onUnauthenticated = vi.fn(() => {
      session.clear();
    });
    const retryFails = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ accessToken: 'new' }))
      .mockResolvedValueOnce(response({}, 401));
    const terminal = createPaymentLinksClient({
      baseUrl: '',
      fetch: retryFails,
      accessToken: session.token,
      onAccessToken: session.setToken,
      onUnauthenticated
    });
    await expect(terminal.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(session.token()).toBe('');
    expect(retryFails.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
    expect(retryFails.mock.calls.filter(([url]) => url === defaultPaymentLinksUrl)).toHaveLength(2);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  test('does not notify unauthenticated when the retried response is not 401', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ accessToken: 'refreshed-token' }))
      .mockResolvedValueOnce(response({}, 403));
    const onUnauthenticated = vi.fn();
    const client = createPaymentLinksClient({
      baseUrl: '',
      fetch: request,
      accessToken: () => 'expired-token',
      onAccessToken: vi.fn(),
      onUnauthenticated
    });

    await expect(client.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      defaultPaymentLinksUrl,
      '/api/v1/auth/refresh',
      defaultPaymentLinksUrl
    ]);
  });

  test('does not refresh non-401 errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({}, 500));
    const client = createPaymentLinksClient({
      baseUrl: '',
      fetch: request,
      accessToken: () => 'token'
    });
    await expect(client.list()).rejects.toThrow('BAAS_REQUEST_FAILED');
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('shares one refresh across concurrent unauthorized requests', async () => {
    let releaseRefresh!: () => void;
    const refreshPending = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 401))
      .mockImplementationOnce(async () => {
        await refreshPending;
        return response({ accessToken: 'shared-token' });
      })
      .mockResolvedValueOnce(
        response(paymentLinksPage([{ id: 'a', feeSnapshot: [], maxInstallments: 1 }]))
      )
      .mockResolvedValueOnce(
        response(paymentLinksPage([{ id: 'b', feeSnapshot: [], maxInstallments: 1 }]))
      );
    const client = createPaymentLinksClient({
      baseUrl: '',
      fetch: request,
      accessToken: () => 'old',
      onAccessToken: () => undefined
    });
    const first = client.list();
    const second = client.list();
    await Promise.resolve();
    releaseRefresh();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(request.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
    expect(request.mock.calls.filter(([url]) => url === defaultPaymentLinksUrl)).toHaveLength(4);
    expect(request.mock.calls.slice(-2).every(([url]) => url === defaultPaymentLinksUrl)).toBe(
      true
    );
  });

  test('loads the typed current profile through authenticated transport', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        merchant: { legalName: 'Legal', displayName: 'Display' },
        owner: { fullName: 'Owner', email: 'owner@example.test' },
        gatewayConnectionStatus: 'ACTIVE'
      })
    );
    const profile = await createCurrentProfileClient({
      baseUrl: '',
      fetch: request,
      accessToken: () => 'access-token'
    }).load();
    expect(profile.owner.fullName).toBe('Owner');
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  test('aggregates wallet, transactions and webhook health for the dashboard', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ balanceCents: '5000', capturedAt: '2026-08-12T12:00:00.000Z', stale: false })
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'pix-approved',
              originType: 'PAYMENT',
              externalReference: 'PIX-order-1',
              status: 'APPROVED',
              grossAmountCents: '1200',
              netAmountCents: '1100',
              occurredAt: '2026-08-12T11:00:00.000Z'
            },
            {
              id: 'card-denied',
              originType: 'PAYMENT',
              externalReference: 'CARD-order-2',
              status: 'DENIED',
              grossAmountCents: '700',
              netAmountCents: '0',
              occurredAt: '2026-08-12T10:00:00.000Z'
            },
            {
              id: 'withdrawal-pending',
              originType: 'WITHDRAWAL',
              externalReference: 'WITHDRAWAL-order-3',
              status: 'PENDING',
              grossAmountCents: '300',
              netAmountCents: '300',
              occurredAt: '2026-08-12T09:00:00.000Z'
            }
          ]
        })
      )
      .mockResolvedValueOnce(response([{ event: 'PAYMENT_PIX', status: 'ACTIVE' }]));

    await expect(createDashboardClient({ baseUrl: '', fetch: request }).load()).resolves.toEqual(
      expect.objectContaining({
        receivedCents: '1100',
        approvedCount: 1,
        deniedCount: 1,
        pendingCount: 0,
        pixReceivedCents: '1100',
        cardReceivedCents: '0',
        webhooksActive: true,
        operations: [
          expect.objectContaining({ id: 'pix-approved', method: 'PIX', status: 'APPROVED' }),
          expect.objectContaining({ id: 'card-denied', method: 'CARD', status: 'DENIED' }),
          expect.objectContaining({
            id: 'withdrawal-pending',
            method: 'WITHDRAWAL',
            status: 'PENDING'
          })
        ]
      })
    );
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/wallet',
      '/api/v1/transactions?limit=100&offset=0',
      '/api/v1/webhooks'
    ]);
  });

  test('logout sends cookies and CSRF, while authenticated feature clients share recovery', async () => {
    let refreshed = false;
    const request = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === '/api/v1/auth/logout')
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url === '/api/v1/auth/refresh') {
        refreshed = true;
        return Promise.resolve(response({ accessToken: 'new-token' }));
      }
      if (!refreshed) return Promise.resolve(response({}, 401));
      if (url === '/api/v1/wallet')
        return Promise.resolve(response({ balanceCents: '100', capturedAt: null, stale: false }));
      if (url.startsWith('/api/v1/transactions')) return Promise.resolve(response({ items: [] }));
      if (url === '/api/v1/webhooks') return Promise.resolve(response([]));
      return Promise.resolve(response({}, 404));
    });
    const options = {
      baseUrl: '',
      fetch: request,
      accessToken: () => 'old-token',
      csrfToken: () => 'csrf-token'
    };
    await createAuthJourneyClient(options).logout();
    await expect(createDashboardClient(options).load()).resolves.toMatchObject({
      wallet: { balanceCents: '100' }
    });
    expect(request.mock.calls[0]?.[1]?.credentials).toBe('include');
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('x-csrf-token')).toBe('csrf-token');
    expect(request).toHaveBeenCalledTimes(8);
    expect(request.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
  });
});
