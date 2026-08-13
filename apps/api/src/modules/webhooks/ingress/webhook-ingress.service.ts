import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { EncryptionService } from '../../gateway-accounts/encryption.service.js';
import type { WebhookEventType } from '../entities/webhook-endpoint.entity.js';
import type { WebhookProcessingStatus } from '../entities/webhook-event.entity.js';

export const WEBHOOK_MAX_BYTES = 256 * 1024;

export interface IngressEndpoint {
  id: string;
  merchantId: string;
  publicEndpointId: string;
  eventType: WebhookEventType;
  secretCiphertext: Buffer;
  status: 'ACTIVE' | 'DISABLED';
}

export interface IngressEvent {
  id: string;
  merchantId: string;
  webhookEndpointId: string;
  dedupeKey: string;
  rawBodyCiphertext: Buffer;
  rawBodyHash: Buffer;
  signatureMetadata: { algorithm: 'sha256'; encoding: 'hex'; event: WebhookEventType };
  status: WebhookProcessingStatus;
  nextAttemptAt: Date | null;
  purgeAfter: Date;
  receivedAt: Date;
}

export interface WebhookIngressStore {
  findActiveEndpoint(publicEndpointId: string): Promise<IngressEndpoint | undefined>;
  insert(event: IngressEvent): Promise<void>;
}

export class WebhookIngressError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: 401 | 404 | 413 | 503
  ) {
    super(code);
    this.name = 'WebhookIngressError';
  }
}

export class WebhookIngressService {
  constructor(
    private readonly store: WebhookIngressStore,
    private readonly encryption: EncryptionService,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID
  ) {}

  async receive(input: {
    publicEndpointId: string;
    rawBody: Buffer;
    signature: string | undefined;
    eventHeader: string | undefined;
  }): Promise<{ status: 'RECEIVED' | 'UNPROCESSABLE' }> {
    if (input.rawBody.byteLength > WEBHOOK_MAX_BYTES)
      throw new WebhookIngressError('WEBHOOK_PAYLOAD_TOO_LARGE', 413);
    const endpoint = await this.store.findActiveEndpoint(input.publicEndpointId);
    if (!endpoint) throw new WebhookIngressError('RESOURCE_NOT_FOUND', 404);
    const secret = this.encryption.decrypt(
      endpoint.secretCiphertext,
      endpoint.merchantId,
      endpoint.id,
      'webhook-secret'
    );
    if (!validSignature(input.rawBody, secret, input.signature))
      throw new WebhookIngressError('WEBHOOK_SIGNATURE_INVALID', 401);

    const bodyHash = createHash('sha256').update(input.rawBody).digest();
    const status = classify(input.rawBody, input.eventHeader, endpoint.eventType);
    const at = this.now();
    const eventId = this.id();
    const event: IngressEvent = {
      id: eventId,
      merchantId: endpoint.merchantId,
      webhookEndpointId: endpoint.id,
      dedupeKey: `${endpoint.eventType}:${bodyHash.toString('hex')}`,
      rawBodyCiphertext: this.encryption.encrypt(
        input.rawBody.toString('base64'),
        endpoint.merchantId,
        eventId,
        'webhook-raw-body'
      ),
      rawBodyHash: bodyHash,
      signatureMetadata: { algorithm: 'sha256', encoding: 'hex', event: endpoint.eventType },
      status,
      nextAttemptAt: status === 'RECEIVED' ? at : null,
      receivedAt: at,
      purgeAfter: new Date(at.getTime() + 90 * 86_400_000)
    };
    try {
      await this.store.insert(event);
    } catch {
      throw new WebhookIngressError('WEBHOOK_PERSISTENCE_UNAVAILABLE', 503);
    }
    return { status };
  }
}

export function validSignature(
  rawBody: Buffer,
  secret: string,
  supplied: string | undefined
): boolean {
  if (!supplied || !/^[0-9a-f]{64}$/u.test(supplied)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const candidate = Buffer.from(supplied, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function classify(
  rawBody: Buffer,
  eventHeader: string | undefined,
  expectedEvent: WebhookEventType
): 'RECEIVED' | 'UNPROCESSABLE' {
  if (eventHeader !== expectedEvent) return 'UNPROCESSABLE';
  try {
    const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const transactionId = body.transactionId ?? body.id;
    return body.event === expectedEvent &&
      typeof transactionId === 'string' &&
      ['APPROVED', 'DENIED'].includes(String(body.status))
      ? 'RECEIVED'
      : 'UNPROCESSABLE';
  } catch {
    return 'UNPROCESSABLE';
  }
}
