import { LeraBoxDependencyError, LeraBoxIdentityClient } from '../auth/lera-box-identity.client.js';

export type GatewayWebhookEvent = 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL';

export interface GatewayWebhook {
  id: string;
  event: GatewayWebhookEvent;
  url: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export class LeraBoxWebhooksClient {
  private readonly http: LeraBoxIdentityClient;

  constructor(baseUrl: string, request: typeof fetch = fetch, timeoutMs = 5_000) {
    this.http = new LeraBoxIdentityClient(baseUrl, request, timeoutMs);
  }

  async create(
    accessToken: string,
    input: { event: GatewayWebhookEvent; url: string; secret: string }
  ): Promise<GatewayWebhook> {
    const response = await this.http.send(
      'create-webhook',
      '/api/webhooks',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(input)
      },
      201
    );
    return parseWebhook(await response.json(), 'create-webhook');
  }

  async list(accessToken: string): Promise<GatewayWebhook[]> {
    const response = await this.http.send(
      'list-webhooks',
      '/api/webhooks',
      { headers: { authorization: `Bearer ${accessToken}` } },
      200
    );
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw malformed('list-webhooks');
    return body.map((item) => parseWebhook(item, 'list-webhooks'));
  }

  async delete(accessToken: string, gatewayWebhookId: string): Promise<void> {
    const response = await this.http.send(
      'delete-webhook',
      `/api/webhooks/${encodeURIComponent(gatewayWebhookId)}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
      200
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (body.deleted !== true) throw malformed('delete-webhook');
  }
}

function parseWebhook(value: unknown, operation: string): GatewayWebhook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed(operation);
  const body = value as Record<string, unknown>;
  if (
    typeof body.id !== 'string' ||
    !['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'].includes(String(body.event)) ||
    typeof body.url !== 'string' ||
    typeof body.active !== 'boolean' ||
    typeof body.createdAt !== 'string' ||
    typeof body.updatedAt !== 'string'
  ) {
    throw malformed(operation);
  }
  return {
    id: body.id,
    event: body.event as GatewayWebhookEvent,
    url: body.url,
    active: body.active,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt
  };
}

function malformed(operation: string): LeraBoxDependencyError {
  return new LeraBoxDependencyError(operation, 'LERA_BOX_MALFORMED_RESPONSE');
}
