import type { EncryptionService } from '../../gateway-accounts/encryption.service.js';
import type { WebhookEventType } from '../entities/webhook-endpoint.entity.js';
import type { WebhookProcessingStatus } from '../entities/webhook-event.entity.js';

const RETRY_MINUTES = [1, 5, 15, 60] as const;
const TERMINAL = new Set(['APPROVED', 'DENIED', 'EXPIRED']);

export interface LeasedWebhookEvent {
  id: string;
  merchantId: string;
  webhookEndpointId: string;
  eventType: WebhookEventType;
  rawBodyCiphertext: Buffer;
  attempts: number;
}

export interface WebhookProjectionResult {
  applied: boolean;
  currentStatus: string;
}

export interface WebhookProcessingStore {
  acquire(limit: number, now: Date, leaseUntil: Date): Promise<LeasedWebhookEvent[]>;
  finish(
    eventId: string,
    expected: 'PROCESSING',
    update: {
      status: WebhookProcessingStatus;
      attempts: number;
      nextAttemptAt: Date | null;
      leaseUntil: null;
      lastErrorCode: string | null;
      processedAt: Date | null;
    }
  ): Promise<boolean>;
  applyPayment(
    merchantId: string,
    gatewayId: string,
    expectedStatuses: string[],
    nextStatus: 'APPROVED' | 'DENIED'
  ): Promise<WebhookProjectionResult>;
  applyWithdrawal(
    merchantId: string,
    gatewayId: string,
    expectedStatuses: string[],
    nextStatus: 'APPROVED' | 'DENIED'
  ): Promise<WebhookProjectionResult>;
}

export class WebhookProcessingService {
  constructor(
    private readonly store: WebhookProcessingStore,
    private readonly encryption: EncryptionService,
    private readonly now: () => Date = () => new Date(),
    private readonly leaseMs = 60_000
  ) {}

  async run(limit = 25): Promise<number> {
    const at = this.now();
    const events = await this.store.acquire(limit, at, new Date(at.getTime() + this.leaseMs));
    for (const event of events) await this.process(event, at);
    return events.length;
  }

  private async process(event: LeasedWebhookEvent, at: Date): Promise<void> {
    const attempt = event.attempts + 1;
    try {
      const payload = this.payload(event);
      const result = await this.apply(event, payload);
      if (!result.applied && result.currentStatus !== payload.status) {
        await this.finish(event.id, attempt, 'UNPROCESSABLE', at, 'INVALID_STATE_REGRESSION');
        return;
      }
      await this.finish(event.id, attempt, 'PROCESSED', at, null);
    } catch (error) {
      const code =
        error instanceof WebhookPayloadError ? error.code : 'PROCESSING_DEPENDENCY_FAILED';
      const retryIndex = attempt - 1;
      const retryMinutes = RETRY_MINUTES[retryIndex];
      if (error instanceof WebhookPayloadError || retryMinutes === undefined) {
        await this.finish(
          event.id,
          attempt,
          error instanceof WebhookPayloadError ? 'UNPROCESSABLE' : 'DEAD_LETTER',
          at,
          code
        );
        return;
      }
      await this.store.finish(event.id, 'PROCESSING', {
        status: 'RETRY_SCHEDULED',
        attempts: attempt,
        nextAttemptAt: new Date(at.getTime() + retryMinutes * 60_000),
        leaseUntil: null,
        lastErrorCode: code,
        processedAt: null
      });
    }
  }

  private payload(event: LeasedWebhookEvent): { id: string; status: 'APPROVED' | 'DENIED' } {
    try {
      const encoded = this.encryption.decrypt(
        event.rawBodyCiphertext,
        event.merchantId,
        event.id,
        'webhook-raw-body'
      );
      const value = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >;
      if (typeof value.id !== 'string' || !['APPROVED', 'DENIED'].includes(String(value.status)))
        throw new Error();
      return { id: value.id, status: value.status as 'APPROVED' | 'DENIED' };
    } catch {
      throw new WebhookPayloadError('WEBHOOK_PAYLOAD_INVALID');
    }
  }

  private apply(event: LeasedWebhookEvent, payload: { id: string; status: 'APPROVED' | 'DENIED' }) {
    const expected = ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'];
    return event.eventType === 'WITHDRAWAL'
      ? this.store.applyWithdrawal(event.merchantId, payload.id, expected, payload.status)
      : this.store.applyPayment(event.merchantId, payload.id, expected, payload.status);
  }

  private async finish(
    eventId: string,
    attempts: number,
    status: WebhookProcessingStatus,
    at: Date,
    error: string | null
  ) {
    await this.store.finish(eventId, 'PROCESSING', {
      status,
      attempts,
      nextAttemptAt: null,
      leaseUntil: null,
      lastErrorCode: error,
      processedAt: status === 'PROCESSED' ? at : null
    });
  }
}

export class WebhookPayloadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WebhookPayloadError';
  }
}

export function isTerminalFinancialStatus(status: string): boolean {
  return TERMINAL.has(status);
}
