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
}

export interface BaasMemorySession {
  readonly token: () => string;
  readonly setToken: (token: string) => void;
  readonly clear: () => void;
}

const SESSION_STORAGE_KEY = 'baas_access_token';

export function createBaasMemorySession(): BaasMemorySession {
  let accessToken = '';
  try {
    accessToken = globalThis.localStorage.getItem(SESSION_STORAGE_KEY) ?? '';
  } catch {
    // SSR or restricted storage — fall back to empty
  }
  return {
    token: () => accessToken,
    setToken: (token) => {
      accessToken = token;
      try {
        globalThis.localStorage.setItem(SESSION_STORAGE_KEY, token);
      } catch {
        // ignore
      }
    },
    clear: () => {
      accessToken = '';
      try {
        globalThis.localStorage.removeItem(SESSION_STORAGE_KEY);
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

export function createAuthJourneyClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  let accessToken = '';
  async function post(path: string, body: unknown): Promise<unknown> {
    const response = await request(`${options.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
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
    async register(input: unknown): Promise<void> {
      await post('/api/v1/auth/register', input);
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
    async refresh(): Promise<boolean> {
      try {
        await post('/api/v1/auth/refresh', {});
        return true;
      } catch {
        return false;
      }
    }
  };
}

export function createPaymentLinksClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const accessToken = options.accessToken?.();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await request(`${options.baseUrl}${path}`, {
      credentials: 'include',
      ...init,
      headers: Object.fromEntries(headers)
    });
    if (!response.ok) throw new Error('BAAS_REQUEST_FAILED');
    return response.json() as Promise<unknown>;
  }
  return {
    list: async () => mapPaymentLinks(await json('/api/v1/checkout-links')),
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
    expiresAt: link.expiresAt
  };
}

export function createWebhooksClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const accessToken = options.accessToken?.();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await request(`${options.baseUrl}${path}`, {
      credentials: 'include',
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
  const request = options.fetch ?? globalThis.fetch;
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const accessToken = options.accessToken?.();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await request(`${options.baseUrl}${path}`, {
      credentials: 'include',
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
  const request = options.fetch ?? globalThis.fetch;
  return {
    async load() {
      const accessToken = options.accessToken?.();
      const response = await request(`${options.baseUrl}/api/v1/wallet`, {
        credentials: 'include',
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
      });
      if (!response.ok) throw new Error('DASHBOARD_UNAVAILABLE');
      return {
        wallet: (await response.json()) as {
          balanceCents: string;
          capturedAt: string;
          stale: boolean;
        },
        receivedCents: '0',
        approvedCount: 0,
        deniedCount: 0,
        pendingCount: 0,
        pixReceivedCents: '0',
        cardReceivedCents: '0',
        operations: []
      };
    }
  };
}

export function createTransactionsClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
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
      const response = await request(`${options.baseUrl}/api/v1/transactions${queryString}`, {
        credentials: 'include',
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
      });
      if (!response.ok) throw new Error('TRANSACTIONS_UNAVAILABLE');
      return (await response.json()) as unknown;
    },
    async getReceiptHtml(id: string): Promise<string> {
      const accessToken = options.accessToken?.();
      const response = await request(
        `${options.baseUrl}/api/v1/transactions/${encodeURIComponent(id)}/receipt`,
        {
          credentials: 'include',
          headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
        }
      );
      if (!response.ok) throw new Error('RECEIPT_UNAVAILABLE');
      return response.text();
    }
  };
}

export function createWithdrawalsClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  return {
    async list(): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const response = await request(`${options.baseUrl}/api/v1/withdrawals`, {
        credentials: 'include',
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
      });
      if (!response.ok) throw new Error('WITHDRAWALS_UNAVAILABLE');
      return (await response.json()) as unknown;
    },
    async request(input: unknown): Promise<unknown> {
      const accessToken = options.accessToken?.();
      const response = await request(`${options.baseUrl}/api/v1/withdrawals`, {
        method: 'POST',
        credentials: 'include',
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
      const response = await request(`${options.baseUrl}/api/v1/wallet`, {
        credentials: 'include',
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
      });
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
