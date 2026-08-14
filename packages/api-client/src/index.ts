import createClient from 'openapi-fetch';

import type { paths } from './generated/schema.js';

export type { components, operations, paths } from './generated/schema.js';

export interface BaasClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  accessToken?: () => string;
  onAccessToken?: (token: string) => void;
  csrfToken?: () => string;
  onCsrfToken?: (token: string) => void;
  onUnauthenticated?: () => void;
}

export interface BaasMemorySession {
  readonly token: () => string;
  readonly setToken: (token: string) => void;
  readonly clear: () => void;
}

const LEGACY_STORAGE_KEY = 'baas_access_token';

export function createBaasMemorySession(): BaasMemorySession {
  let accessToken = '';
  try {
    // Access tokens are session-only and also protected by the HttpOnly cookie.
    globalThis.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // SSR or restricted storage.
  }
  return {
    token: () => accessToken,
    setToken: (token) => {
      accessToken = token;
    },
    clear: () => {
      accessToken = '';
      try {
        globalThis.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };
}

export function createBaasClient(options: BaasClientOptions) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {})
  });
}

function createAuthenticatedTransport(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  let refreshInFlight: Promise<boolean> | undefined;
  let unauthenticatedNotified = false;

  const notifyUnauthenticated = () => {
    if (unauthenticatedNotified) return;
    unauthenticatedNotified = true;
    options.onUnauthenticated?.();
  };

  const refresh = async (): Promise<boolean> => {
    try {
      const csrfToken = options.csrfToken?.();
      const headers = new Headers({ 'content-type': 'application/json' });
      if (csrfToken) headers.set('x-csrf-token', csrfToken);
      const response = await request(`${options.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: '{}'
      });
      if (!response.ok) return false;
      const result = (await response.json()) as { accessToken?: unknown; csrfToken?: unknown };
      if (typeof result.accessToken !== 'string') return false;
      options.onAccessToken?.(result.accessToken);
      if (typeof result.csrfToken === 'string') options.onCsrfToken?.(result.csrfToken);
      return true;
    } catch {
      return false;
    }
  };

  return async (path: string, init?: RequestInit): Promise<Response> => {
    const send = () => {
      const headers = new Headers(init?.headers);
      const token = options.accessToken?.();
      if (token) headers.set('authorization', `Bearer ${token}`);
      return request(`${options.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers
      });
    };
    const response = await send();
    if (response.status !== 401) return response;
    refreshInFlight ??= refresh().finally(() => {
      refreshInFlight = undefined;
    });
    if (!(await refreshInFlight)) {
      notifyUnauthenticated();
      return response;
    }
    const retry = await send();
    if (retry.status === 401) notifyUnauthenticated();
    return retry;
  };
}

export function createAuthJourneyClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  let accessToken = '';
  async function post(path: string, body: unknown): Promise<unknown> {
    const headers = new Headers({ 'content-type': 'application/json' });
    const csrfToken = options.csrfToken?.();
    if (csrfToken) headers.set('x-csrf-token', csrfToken);
    const response = await request(`${options.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let code = 'BAAS_REQUEST_FAILED';
      let detail: string | undefined;
      try {
        const problem = (await response.json()) as { code?: string; detail?: string };
        if (typeof problem.code === 'string') code = problem.code;
        if (typeof problem.detail === 'string') detail = problem.detail;
      } catch {
        // ignore JSON parse failure
      }
      const error = new Error(code) as Error & { code?: string; detail?: string };
      error.code = code;
      if (detail) error.detail = detail;
      throw error;
    }
    const result =
      response.status === 204 ? {} : ((await response.json()) as { accessToken?: unknown });
    if (typeof result.accessToken === 'string') {
      accessToken = result.accessToken;
      options.onAccessToken?.(result.accessToken);
    }
    return result;
  }
  return {
    async login(input: { email: string; password: string; remember: boolean }): Promise<void> {
      await post('/api/v1/auth/login', input);
    },
    async register(input: unknown): Promise<string | null> {
      const result = (await post('/api/v1/auth/register', input)) as {
        gatewayOnboarding?: { status?: unknown } | null;
      };
      const status = result.gatewayOnboarding?.status;
      return typeof status === 'string' ? status : null;
    },
    async connect(input: {
      document: string;
      password: string;
    }): Promise<'ACTIVE' | 'PROFILE_MISMATCH'> {
      const response = await request(`${options.baseUrl}/api/v1/gateway-account/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.accessToken?.() ?? accessToken}`
        },
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        const problem = (await response.json()) as { code?: unknown };
        if (problem.code === 'GATEWAY_PROFILE_MISMATCH') return 'PROFILE_MISMATCH';
        throw new Error('BAAS_REQUEST_FAILED');
      }
      const result = (await response.json()) as { status?: unknown };
      return result.status === 'ACTIVE' ? 'ACTIVE' : 'PROFILE_MISMATCH';
    },
    async registerGateway(input: unknown): Promise<string> {
      const headers = new Headers({ 'content-type': 'application/json' });
      const csrfToken = options.csrfToken?.();
      if (csrfToken) headers.set('x-csrf-token', csrfToken);
      const response = await request(`${options.baseUrl}/api/v1/gateway-account/register`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(input)
      });
      if (!response.ok) throw new Error('GATEWAY_REGISTRATION_FAILED');
      const result = (await response.json()) as { status?: unknown };
      return typeof result.status === 'string' ? result.status : 'GATEWAY_REGISTRATION_UNKNOWN';
    },
    async refresh(): Promise<boolean> {
      try {
        await post('/api/v1/auth/refresh', {});
        return true;
      } catch {
        return false;
      }
    },
    async logout(): Promise<void> {
      const csrfToken = options.csrfToken?.();
      const headers = new Headers({ 'content-type': 'application/json' });
      if (csrfToken) headers.set('x-csrf-token', csrfToken);
      await request(`${options.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: '{}'
      });
    }
  };
}

export function createCurrentProfileClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  return {
    async load() {
      const response = await request('/api/v1/session/profile');
      if (!response.ok) throw new Error('PROFILE_UNAVAILABLE');
      return (await response.json()) as {
        merchant: { legalName: string; displayName: string };
        owner: { fullName: string; email: string };
        gatewayConnectionStatus: string | null;
      };
    }
  };
}

export function createPaymentLinksClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const accessToken = options.accessToken?.();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await request(path, {
      ...init,
      headers: Object.fromEntries(headers)
    });
    if (!response.ok) throw new Error('BAAS_REQUEST_FAILED');
    return response.json() as Promise<unknown>;
  }
  return {
    list: async () => mapPaymentLinks(await json('/api/v1/checkout-links')),
    detail: async (id: string) =>
      mapPaymentLink(await json(`/api/v1/checkout-links/${encodeURIComponent(id)}`)),
    share: async (id: string) => {
      const value = (await json(`/api/v1/checkout-links/${encodeURIComponent(id)}/share`, {
        method: 'POST'
      })) as { publicToken?: unknown };
      if (typeof value.publicToken !== 'string') throw new Error('BAAS_RESPONSE_INVALID');
      return { publicToken: value.publicToken };
    },
    create: async (input: PaymentLinkInput) =>
      mapPaymentLink(
        await json('/api/v1/checkout-links', {
          method: 'POST',
          body: JSON.stringify({
            publicReference: input.reference,
            description: input.description,
            amountCents: input.amountCents,
            allowedMethods: input.methods,
            maxInstallments: input.maxInstallments,
            expiresAt: input.expiresAt
          })
        })
      ),
    cancel: async (id: string) =>
      mapPaymentLink(
        await json(`/api/v1/checkout-links/${encodeURIComponent(id)}/cancel`, {
          method: 'POST'
        })
      ),
    sendEmail: async (id: string, email: string) =>
      json(`/api/v1/checkout-links/${encodeURIComponent(id)}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ email })
      }) as Promise<{ deliveryId: string; status: string; recipientMasked: string }>
  };
}

export interface PaymentLinkInput {
  reference: string;
  description: string;
  amountCents: string;
  methods: 'PIX' | 'CARD' | 'PIX_CARD';
  maxInstallments: number;
  selectedFeeBps: number | null;
  expiresAt: string;
}

interface PaymentLinkResponse {
  id: string;
  publicReference: string;
  description: string;
  amountCents: string;
  allowedMethods: PaymentLinkInput['methods'];
  maxInstallments: number;
  feeSnapshot: { installments: number; feeBps: number }[];
  status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  createdAt?: string;
  publicToken?: string;
}

function mapPaymentLinks(value: unknown) {
  if (!Array.isArray(value)) throw new Error('BAAS_RESPONSE_INVALID');
  return value.map(mapPaymentLink);
}

function mapPaymentLink(value: unknown) {
  const link = value as PaymentLinkResponse;
  const selectedFee = link.feeSnapshot.find((fee) => fee.installments === link.maxInstallments);
  return {
    id: link.id,
    reference: link.publicReference,
    description: link.description,
    amountCents: link.amountCents,
    methods: link.allowedMethods,
    maxInstallments: link.maxInstallments,
    selectedFeeBps: selectedFee?.feeBps ?? null,
    status: link.status,
    expiresAt: link.expiresAt,
    ...(link.createdAt ? { createdAt: link.createdAt } : {}),
    ...(link.publicToken ? { publicToken: link.publicToken } : {})
  };
}

export function createWebhooksClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const accessToken = options.accessToken?.();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await request(path, {
      ...init,
      headers
    });
    if (!response.ok) throw new Error('BAAS_REQUEST_FAILED');
    return response.status === 204 ? undefined : (response.json() as Promise<unknown>);
  }
  return {
    list: () => json('/api/v1/webhooks') as Promise<never[]>,
    configure: (event: 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL') =>
      json('/api/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify({ event })
      }) as Promise<never>,
    remove: async (event: 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL') => {
      await json(`/api/v1/webhooks/configurations/${event}`, { method: 'DELETE' });
    }
  };
}

export function createReconciliationClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const accessToken = options.accessToken?.();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await request(path, {
      ...init,
      headers
    });
    if (!response.ok) {
      const code = response.status === 503 ? 'GATEWAY_UNAVAILABLE' : 'REQUEST_FAILED';
      const error = new Error(code) as Error & { code: string };
      error.code = code;
      throw error;
    }
    return response.json() as Promise<unknown>;
  }
  return {
    list: () => json('/api/v1/reconciliation') as Promise<never[]>,
    verify: (operationId: string) =>
      json(`/api/v1/reconciliation/${encodeURIComponent(operationId)}/verify`, {
        method: 'POST'
      }) as Promise<never>
  };
}

export function createDashboardClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  return {
    async load() {
      const [walletResponse, transactionsResponse, webhooksResponse] = await Promise.all([
        request('/api/v1/wallet'),
        request('/api/v1/transactions?limit=100&offset=0'),
        request('/api/v1/webhooks')
      ]);
      if (!walletResponse.ok || !transactionsResponse.ok || !webhooksResponse.ok)
        throw new Error('DASHBOARD_UNAVAILABLE');
      const wallet = (await walletResponse.json()) as {
        balanceCents: string;
        capturedAt: string;
        stale: boolean;
      };
      const statement = (await transactionsResponse.json()) as {
        items?: Array<{
          id: string;
          originType: 'PAYMENT' | 'WITHDRAWAL';
          externalReference: string;
          status: 'APPROVED' | 'DENIED' | 'PENDING' | 'EXPIRED' | 'CANCELLED';
          grossAmountCents: string;
          netAmountCents: string;
          occurredAt: string;
        }>;
      };
      const items = statement.items ?? [];
      const payments = items.filter((item) => item.originType === 'PAYMENT');
      const approvedPayments = payments.filter((item) => item.status === 'APPROVED');
      const receivedCents = approvedPayments.reduce(
        (total, item) => total + BigInt(item.netAmountCents),
        0n
      );
      const pixReceivedCents = approvedPayments
        .filter((item) => item.externalReference.startsWith('PIX-'))
        .reduce((total, item) => total + BigInt(item.netAmountCents), 0n);
      const cardReceivedCents = receivedCents - pixReceivedCents;
      const webhooks = (await webhooksResponse.json()) as Array<{ status?: string }>;
      return {
        wallet,
        receivedCents: receivedCents.toString(),
        approvedCount: payments.filter((item) => item.status === 'APPROVED').length,
        deniedCount: payments.filter((item) => item.status === 'DENIED').length,
        pendingCount: payments.filter((item) => item.status === 'PENDING').length,
        pixReceivedCents: pixReceivedCents.toString(),
        cardReceivedCents: cardReceivedCents.toString(),
        webhooksActive: webhooks.some((item) => item.status === 'ACTIVE'),
        operations: items.slice(0, 10).map((item) => ({
          id: item.id,
          reference: item.externalReference,
          method:
            item.originType === 'WITHDRAWAL'
              ? ('WITHDRAWAL' as const)
              : item.externalReference.startsWith('PIX-')
                ? ('PIX' as const)
                : ('CARD' as const),
          amountCents: item.grossAmountCents,
          status: ['APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'].includes(item.status)
            ? item.status
            : ('PENDING' as const),
          occurredAt: item.occurredAt
        }))
      };
    }
  };
}

export function createTransactionsClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  return {
    async list(query?: Record<string, unknown>): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const params = new URLSearchParams();
      if (query) {
        for (const [key, val] of Object.entries(query)) {
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            params.set(key, String(val));
          }
        }
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await request(`/api/v1/transactions${queryString}`);
      if (!response.ok) throw new Error('TRANSACTIONS_UNAVAILABLE');
      return (await response.json()) as unknown;
    },
    async getReceiptHtml(id: string): Promise<string> {
      const response = await request(`/api/v1/transactions/${encodeURIComponent(id)}/receipt`);
      if (!response.ok) throw new Error('RECEIPT_UNAVAILABLE');
      return response.text();
    },
    async downloadReceiptPdf(id: string): Promise<Blob> {
      const response = await request(`/api/v1/transactions/${encodeURIComponent(id)}/receipt?format=pdf`);
      if (!response.ok) throw new Error('RECEIPT_UNAVAILABLE');
      return response.blob();
    }
  };
}

export function createWithdrawalsClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  return {
    async list(): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const response = await request('/api/v1/withdrawals');
      if (!response.ok) throw new Error('WITHDRAWALS_UNAVAILABLE');
      return (await response.json()) as unknown;
    },
    async request(input: unknown): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const response = await request('/api/v1/withdrawals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        let code = 'WITHDRAWAL_FAILED';
        try {
          const problem = (await response.json()) as { code?: string };
          if (typeof problem.code === 'string') code = problem.code;
        } catch {
          // ignore
        }
        const error = new Error(code) as Error & { code: string };
        error.code = code;
        throw error;
      }
      return (await response.json()) as unknown;
    },
    async getBalance(): Promise<{ balanceCents: string }> {
      const accessToken = options.accessToken?.();
      const response = await request('/api/v1/wallet');
      if (!response.ok) throw new Error('WALLET_UNAVAILABLE');
      const data = (await response.json()) as { balanceCents?: string };
      return { balanceCents: data.balanceCents ?? '0' };
    }
  };
}

export interface PublicCheckoutView {
  id: string;
  description: string;
  amountCents: string;
  methods: 'PIX' | 'CARD' | 'PIX_CARD';
  maxInstallments: number;
  state: 'READY' | 'EXPIRED' | 'PAID' | 'CANCELLED';
}
export function createCheckoutSessionClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  return {
    async exchange(token: string): Promise<{ checkout: PublicCheckoutView; csrfToken: string }> {
      const response = await request(`${options.baseUrl}/api/v1/public/checkout-sessions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!response.ok) throw new Error('CHECKOUT_SESSION_UNAVAILABLE');
      const result = (await response.json()) as { checkout: PublicCheckoutView; csrfToken: string };
      options.onCsrfToken?.(result.csrfToken);
      return result;
    }
  };
}
export function createPixStatusClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  return {
    async create(input: { payerDocument: string }): Promise<never> {
      const response = await request(`${options.baseUrl}/api/v1/public/payments/pix`, {
        method: 'POST',
        credentials: 'include',
        headers: checkoutHeaders(options),
        body: JSON.stringify(input)
      });
      if (!response.ok) throw new Error('PIX_CREATION_UNAVAILABLE');
      return response.json() as Promise<never>;
    },
    async status(attemptId: string): Promise<never> {
      const response = await request(
        `${options.baseUrl}/api/v1/public/payments/pix/${encodeURIComponent(attemptId)}`,
        { credentials: 'include', headers: { accept: 'application/json' } }
      );
      if (!response.ok) throw new Error('PIX_STATUS_UNAVAILABLE');
      return response.json() as Promise<never>;
    }
  };
}
export function createCardCheckoutClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function post(path: string, body: unknown): Promise<never> {
    const response = await request(`${options.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: checkoutHeaders(options),
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let code = 'REQUEST_FAILED';
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (problem.code === 'FEE_CHANGED' || problem.code === 'CARD_COOLDOWN') code = problem.code;
      } catch {
        // Response content is deliberately ignored; no card field is included in the error.
      }
      const error = new Error(code) as Error & { code: string };
      error.code = code;
      throw error;
    }
    return response.json() as Promise<never>;
  }
  return {
    quote: (input: { amountCents: string; brand: string; installments: number }) =>
      post('/api/v1/public/payments/card/quote', {
        brand: input.brand,
        installments: input.installments
      }),
    confirm: (input: {
      quoteId: string;
      cardNumber: string;
      cardHolder: string;
      expiryMonth: number;
      expiryYear: number;
      cvv: string;
    }) =>
      post('/api/v1/public/payments/card/confirm', {
        quoteId: input.quoteId,
        card: {
          number: input.cardNumber,
          holder: input.cardHolder,
          expiryMonth: input.expiryMonth,
          expiryYear: input.expiryYear,
          cvv: input.cvv
        }
      })
  };
}

function checkoutHeaders(options: BaasClientOptions): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const csrfToken = options.csrfToken?.();
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  return headers;
}

export function createNotificationsClient(options: BaasClientOptions) {
  const request = createAuthenticatedTransport(options);
  return {
    async listDeliveries(query?: Record<string, unknown>): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const params = new URLSearchParams();
      if (query) {
        for (const [key, val] of Object.entries(query)) {
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            params.set(key, String(val));
          }
        }
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await request(`/api/v1/notifications/email-deliveries${queryString}`);
      if (!response.ok) throw new Error('NOTIFICATIONS_UNAVAILABLE');
      return (await response.json()) as unknown;
    },
    async retryDelivery(id: string): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const response = await request(
        `/api/v1/notifications/email-deliveries/${encodeURIComponent(id)}/retry`,
        {
          method: 'POST'
        }
      );
      if (!response.ok) throw new Error('RETRY_FAILED');
      return (await response.json()) as unknown;
    }
  };
}
