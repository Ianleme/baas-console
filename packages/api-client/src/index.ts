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
