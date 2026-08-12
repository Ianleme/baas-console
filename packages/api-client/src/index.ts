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
