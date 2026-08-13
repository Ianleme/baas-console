import { randomUUID } from 'node:crypto';

import { LeraBoxTimeoutError } from '../../../integrations/lera-box/auth/lera-box-identity.client.js';
import type {
  GatewayPixResult,
  LeraBoxPixClient
} from '../../../integrations/lera-box/payments/lera-box-pix.client.js';
import type { EmailOutboxService } from '../../notifications/email-outbox.service.js';

export interface PixAttempt {
  id: string;
  merchantId: string;
  checkoutLinkId: string;
  externalReference: string;
  status: 'PROCESSING' | 'PENDING' | 'RECONCILIATION_PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  gatewayPaymentId: string | null;
  txid: string | null;
  emv: string | null;
  qrCodeBase64: string | null;
  failureCode: string | null;
}
export interface PixAttemptStore {
  begin(
    input: Omit<
      PixAttempt,
      'status' | 'gatewayPaymentId' | 'txid' | 'emv' | 'qrCodeBase64' | 'failureCode'
    >
  ): Promise<PixAttempt>;
  transition(
    attemptId: string,
    expected: PixAttempt['status'][],
    update: Partial<PixAttempt>
  ): Promise<PixAttempt>;
  markLinkPaid(checkoutLinkId: string): Promise<void>;
}
export interface PixStartInput {
  merchantId: string;
  checkoutLinkId: string;
  amountCents: string;
  description: string;
  payerDocument: string;
  payerEmail?: string;
  accessToken: string;
}
export class PixPaymentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PixPaymentError';
  }
}
export class PixPaymentService {
  constructor(
    private readonly gateway: Pick<LeraBoxPixClient, 'create'>,
    private readonly store: PixAttemptStore,
    private readonly id: () => string = randomUUID,
    private readonly outbox?: EmailOutboxService
  ) {}
  async start(input: PixStartInput): Promise<{ httpStatus: 201 | 202; attempt: PixAttempt }> {
    validate(input);
    const attemptId = this.id();
    const attempt = await this.store.begin({
      id: attemptId,
      merchantId: input.merchantId,
      checkoutLinkId: input.checkoutLinkId,
      externalReference: `PIX-${attemptId}`
    });
    let result: GatewayPixResult;
    try {
      result = await this.gateway.create(input.accessToken, {
        amountCents: input.amountCents,
        payerDocument: digits(input.payerDocument),
        description: input.description.trim(),
        externalReference: attempt.externalReference
      });
    } catch (error) {
      if (!(error instanceof LeraBoxTimeoutError)) {
        await this.store.transition(attempt.id, ['PROCESSING'], {
          status: 'DENIED',
          failureCode: dependencyCode(error)
        });
        throw error;
      }
      return {
        httpStatus: 202,
        attempt: await this.store.transition(attempt.id, ['PROCESSING'], {
          status: 'RECONCILIATION_PENDING'
        })
      };
    }
    return {
      httpStatus: 201,
      attempt: await this.apply(attempt.id, result, input.payerEmail)
    };
  }
  async applyLateOutcome(
    attemptId: string,
    result: GatewayPixResult,
    payerEmail?: string
  ): Promise<PixAttempt> {
    return this.apply(attemptId, result, payerEmail);
  }
  private async apply(
    attemptId: string,
    result: GatewayPixResult,
    payerEmail?: string
  ): Promise<PixAttempt> {
    const next = await this.store.transition(
      attemptId,
      ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'DENIED', 'EXPIRED', 'APPROVED'],
      {
        status: result.status,
        gatewayPaymentId: result.gatewayPaymentId,
        txid: result.txid,
        emv: result.emv,
        qrCodeBase64: result.qrCodeBase64,
        failureCode: result.denialReason
      }
    );
    if (result.status === 'APPROVED') {
      await this.store.markLinkPaid(next.checkoutLinkId);
      if (this.outbox && payerEmail) {
        await this.outbox.enqueue({
          merchantId: next.merchantId,
          kind: 'PAYMENT_RECEIPT',
          idempotencyKey: `receipt:pix:${next.id}`,
          recipient: payerEmail,
          payload: {
            attemptId: next.id,
            checkoutLinkId: next.checkoutLinkId,
            gatewayPaymentId: next.gatewayPaymentId,
            txid: next.txid,
            method: 'PIX',
            text: `Comprovante de pagamento Pix aprovado (Ref: ${next.externalReference})`
          }
        });
      }
    }
    return next;
  }
}
function validate(input: PixStartInput) {
  if (!/^\d+$/u.test(input.amountCents) || BigInt(input.amountCents) <= 0n)
    throw new PixPaymentError('AMOUNT_INVALID');
  if (!isValidDocument(input.payerDocument)) throw new PixPaymentError('PAYER_DOCUMENT_INVALID');
  if (input.description.trim().length === 0 || input.description.trim().length > 255)
    throw new PixPaymentError('DESCRIPTION_INVALID');
}
function digits(value: string) {
  return value.replace(/\D/gu, '');
}
export function isValidDocument(value: string): boolean {
  const number = digits(value);
  if (!/^\d{11}(?:\d{3})?$/u.test(number) || /^(\d)\1+$/u.test(number)) return false;
  const base = number.length === 11 ? 9 : 12;
  const calculate = (length: number) => {
    let sum = 0;
    let weight = length === 9 ? 10 : length === 10 ? 11 : length === 12 ? 5 : 6;
    for (let index = 0; index < length; index += 1) {
      sum += Number(number[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return (
    Number(number[base]) === calculate(base) && Number(number[base + 1]) === calculate(base + 1)
  );
}

function dependencyCode(error: unknown): string {
  return error instanceof Error && /^LERA_BOX_[A-Z_]+/u.test(error.message)
    ? (error.message.split(':')[0] ?? 'GATEWAY_PAYMENT_FAILED')
    : 'GATEWAY_PAYMENT_FAILED';
}
