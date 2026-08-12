import createClient from 'openapi-fetch';

import type { paths } from './generated/schema.js';

export type { components, operations, paths } from './generated/schema.js';

export interface BaasClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export function createBaasClient(options: BaasClientOptions) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {})
  });
}

export function createAuthJourneyClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function post(path: string, body: unknown): Promise<unknown> {
    const response = await request(`${options.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('BAAS_REQUEST_FAILED');
    return response.status === 204 ? {} : (response.json() as Promise<unknown>);
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
      const result = (await post('/api/v1/gateway-account/connect', input)) as { status?: unknown };
      return result.status === 'ACTIVE' ? 'ACTIVE' : 'PROFILE_MISMATCH';
    }
  };
}

export function createPaymentLinksClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const response = await request(`${options.baseUrl}${path}`, {
      credentials: 'include',
      ...init,
      headers
    });
    if (!response.ok) throw new Error('BAAS_REQUEST_FAILED');
    return response.json() as Promise<unknown>;
  }
  return {
    list: () => json('/api/v1/checkout-links') as Promise<never[]>,
    create: (input: unknown) =>
      json('/api/v1/checkout-links', {
        method: 'POST',
        body: JSON.stringify(input)
      }) as Promise<never>,
    cancel: (id: string) =>
      json(`/api/v1/checkout-links/${encodeURIComponent(id)}/cancel`, {
        method: 'POST'
      }) as Promise<never>
  };
}

export function createWebhooksClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
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
      await json(`/api/v1/webhooks/${event}`, { method: 'DELETE' });
    }
  };
}

export function createReconciliationClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  async function json(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
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
      return response.json() as Promise<{ checkout: PublicCheckoutView; csrfToken: string }>;
    }
  };
}
export function createPixStatusClient(options: BaasClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  return {
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
      headers: { 'content-type': 'application/json' },
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
    quote: (input: unknown) => post('/api/v1/public/payments/card/quote', input),
    confirm: (input: unknown) => post('/api/v1/public/payments/card/confirm', input)
  };
}
