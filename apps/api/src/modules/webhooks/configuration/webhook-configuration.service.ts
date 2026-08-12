import { randomBytes, randomUUID } from 'node:crypto';

import type {
  GatewayWebhookEvent,
  LeraBoxWebhooksClient
} from '../../../integrations/lera-box/webhooks/lera-box-webhooks.client.js';
import type { EncryptionService } from '../../gateway-accounts/encryption.service.js';

export interface WebhookConfigurationRecord {
  id: string;
  merchantId: string;
  publicEndpointId: string;
  eventType: GatewayWebhookEvent;
  gatewayWebhookId: string;
  secretCiphertext: Buffer;
  status: 'ACTIVE' | 'DISABLED';
  configuredAt: Date;
  lastReceivedAt: Date | null;
}

export interface WebhookConfigurationStore {
  find(
    merchantId: string,
    event: GatewayWebhookEvent
  ): Promise<WebhookConfigurationRecord | undefined>;
  list(merchantId: string): Promise<WebhookConfigurationRecord[]>;
  replace(record: WebhookConfigurationRecord, audit: WebhookConfigurationAudit): Promise<void>;
  remove(
    merchantId: string,
    event: GatewayWebhookEvent,
    audit: WebhookConfigurationAudit
  ): Promise<boolean>;
}

export interface WebhookConfigurationAudit {
  id: string;
  merchantId: string;
  actorUserId: string;
  action: 'WEBHOOK_CONFIGURED' | 'WEBHOOK_RECONFIGURED' | 'WEBHOOK_REMOVED';
  targetPublicId: string;
  requestId: string;
  metadata: { event: GatewayWebhookEvent };
}

export interface WebhookConfigurationView {
  event: GatewayWebhookEvent;
  status: 'ACTIVE' | 'DISABLED';
  configuredAt: Date;
  lastReceivedAt: Date | null;
}

export class WebhookConfigurationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WebhookConfigurationError';
  }
}

export class WebhookConfigurationService {
  constructor(
    private readonly gateway: Pick<LeraBoxWebhooksClient, 'create' | 'delete'>,
    private readonly store: WebhookConfigurationStore,
    private readonly encryption: EncryptionService,
    private readonly publicBaseUrl: string,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
    private readonly opaqueId: () => string = () => randomBytes(24).toString('hex'),
    private readonly secret: () => string = () => randomBytes(32).toString('base64url')
  ) {}

  async configure(input: {
    merchantId: string;
    actorUserId: string;
    requestId: string;
    accessToken: string;
    event: GatewayWebhookEvent;
  }): Promise<WebhookConfigurationView> {
    assertEvent(input.event);
    const previous = await this.store.find(input.merchantId, input.event);
    if (previous) await this.gateway.delete(input.accessToken, previous.gatewayWebhookId);

    const id = previous?.id ?? this.id();
    const publicEndpointId = this.opaqueId();
    const secret = this.secret();
    const gateway = await this.gateway.create(input.accessToken, {
      event: input.event,
      url: `${this.publicBaseUrl}/api/v1/webhooks/${publicEndpointId}`,
      secret
    });
    const record: WebhookConfigurationRecord = {
      id,
      merchantId: input.merchantId,
      publicEndpointId,
      eventType: input.event,
      gatewayWebhookId: gateway.id,
      secretCiphertext: this.encryption.encrypt(secret, input.merchantId, id, 'webhook-secret'),
      status: gateway.active ? 'ACTIVE' : 'DISABLED',
      configuredAt: this.now(),
      lastReceivedAt: previous?.lastReceivedAt ?? null
    };
    await this.store.replace(record, {
      id: this.id(),
      merchantId: input.merchantId,
      actorUserId: input.actorUserId,
      action: previous ? 'WEBHOOK_RECONFIGURED' : 'WEBHOOK_CONFIGURED',
      targetPublicId: publicEndpointId,
      requestId: input.requestId,
      metadata: { event: input.event }
    });
    return view(record);
  }

  async list(merchantId: string): Promise<WebhookConfigurationView[]> {
    return (await this.store.list(merchantId)).map(view);
  }

  async remove(input: {
    merchantId: string;
    actorUserId: string;
    requestId: string;
    accessToken: string;
    event: GatewayWebhookEvent;
  }): Promise<void> {
    assertEvent(input.event);
    const record = await this.store.find(input.merchantId, input.event);
    if (!record) throw new WebhookConfigurationError('WEBHOOK_NOT_FOUND');
    await this.gateway.delete(input.accessToken, record.gatewayWebhookId);
    const removed = await this.store.remove(input.merchantId, input.event, {
      id: this.id(),
      merchantId: input.merchantId,
      actorUserId: input.actorUserId,
      action: 'WEBHOOK_REMOVED',
      targetPublicId: record.publicEndpointId,
      requestId: input.requestId,
      metadata: { event: input.event }
    });
    if (!removed) throw new WebhookConfigurationError('WEBHOOK_STATE_CONFLICT');
  }
}

function assertEvent(event: string): asserts event is GatewayWebhookEvent {
  if (!['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'].includes(event))
    throw new WebhookConfigurationError('WEBHOOK_EVENT_INVALID');
}

function view(record: WebhookConfigurationRecord): WebhookConfigurationView {
  return {
    event: record.eventType,
    status: record.status,
    configuredAt: record.configuredAt,
    lastReceivedAt: record.lastReceivedAt
  };
}
