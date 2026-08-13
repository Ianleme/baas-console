import { randomUUID } from 'node:crypto';

import { LeraBoxTimeoutError } from '../../../integrations/lera-box/auth/lera-box-identity.client.js';
import type {
  CardBrand,
  GatewayFee
} from '../../../integrations/lera-box/fees/lera-box-fees.client.js';
import type {
  GatewayCardResult,
  LeraBoxCardClient
} from '../../../integrations/lera-box/payments/lera-box-card.client.js';
import type { EmailOutboxService } from '../../notifications/email-outbox.service.js';

export interface CardQuote {
  quoteId: string;
  brand: CardBrand;
  installments: number;
  feeBps: number;
  grossAmountCents: string;
  feeAmountCents: string;
  netAmountCents: string;
}
export interface CardAttempt {
  id: string;
  merchantId: string;
  checkoutLinkId: string;
  externalReference: string;
  status: 'PROCESSING' | 'PENDING' | 'RECONCILIATION_PENDING' | 'APPROVED' | 'DENIED';
  gatewayPaymentId: string | null;
  installments: number;
  feeBps: number;
  grossAmountCents: string;
  feeAmountCents: string;
  netAmountCents: string;
  cardBrand: CardBrand;
  cardLast4: string;
  failureCode: string | null;
}
export interface CardAttemptStore {
  countRecentDenials(merchantId: string, checkoutLinkId: string, since: Date): Promise<number>;
  begin(
    input: Omit<CardAttempt, 'status' | 'gatewayPaymentId' | 'failureCode'>
  ): Promise<CardAttempt>;
  transition(
    id: string,
    expected: CardAttempt['status'][],
    update: Partial<CardAttempt>
  ): Promise<CardAttempt>;
  markLinkPaid(checkoutLinkId: string): Promise<void>;
}
export interface CardConfirmInput {
  merchantId: string;
  checkoutLinkId: string;
  accessToken: string;
  description: string;
  payerEmail?: string;
  quote: CardQuote;
  card: {
    number: string;
    holder: string;
    expiryMonth: number;
    expiryYear: number;
    cvv: string;
  };
}
export class CardPaymentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CardPaymentError';
  }
}
export class CardPaymentService {
  constructor(
    private readonly fees: { list(brand?: CardBrand): Promise<GatewayFee[]> },
    private readonly gateway: Pick<LeraBoxCardClient, 'create'>,
    private readonly store: CardAttemptStore,
    private readonly outbox?: EmailOutboxService,
    private readonly id: () => string = randomUUID,
    private readonly now: () => Date = () => new Date()
  ) {}
  async quote(amountCents: string, brand: CardBrand, installments: number): Promise<CardQuote> {
    const gross = positiveCents(amountCents);
    const fee = await this.currentFee(brand, installments);
    const feeAmount = (gross * BigInt(fee.feeBps) + 5_000n) / 10_000n;
    return {
      quoteId: this.id(),
      brand,
      installments,
      feeBps: fee.feeBps,
      grossAmountCents: gross.toString(),
      feeAmountCents: feeAmount.toString(),
      netAmountCents: (gross - feeAmount).toString()
    };
  }
  async confirm(input: CardConfirmInput): Promise<{ httpStatus: 201 | 202; attempt: CardAttempt }> {
    validateCard(input.card, this.now());
    if (input.description.trim().length === 0 || input.description.trim().length > 255)
      throw new CardPaymentError('DESCRIPTION_INVALID');
    const denialCount = await this.store.countRecentDenials(
      input.merchantId,
      input.checkoutLinkId,
      new Date(this.now().getTime() - 15 * 60_000)
    );
    if (denialCount >= 5) throw new CardPaymentError('CARD_COOLDOWN');
    const current = await this.currentFee(input.quote.brand, input.quote.installments);
    if (current.feeBps !== input.quote.feeBps) throw new CardPaymentError('FEE_CHANGED');
    const last4 = digits(input.card.number).slice(-4);
    const attempt = await this.store.begin({
      id: this.id(),
      merchantId: input.merchantId,
      checkoutLinkId: input.checkoutLinkId,
      externalReference: `CARD-${input.checkoutLinkId}-${this.id()}`,
      installments: input.quote.installments,
      feeBps: input.quote.feeBps,
      grossAmountCents: input.quote.grossAmountCents,
      feeAmountCents: input.quote.feeAmountCents,
      netAmountCents: input.quote.netAmountCents,
      cardBrand: input.quote.brand,
      cardLast4: last4
    });
    let result: GatewayCardResult;
    try {
      result = await this.gateway.create(input.accessToken, {
        amountCents: input.quote.grossAmountCents,
        cardNumber: digits(input.card.number),
        cardHolder: input.card.holder.trim(),
        expiryMonth: input.card.expiryMonth,
        expiryYear: input.card.expiryYear,
        cvv: input.card.cvv,
        installments: input.quote.installments,
        feeBps: input.quote.feeBps,
        description: input.description.trim(),
        externalReference: attempt.externalReference
      });
    } catch (error) {
      if (!(error instanceof LeraBoxTimeoutError)) throw error;
      return {
        httpStatus: 202,
        attempt: await this.store.transition(attempt.id, ['PROCESSING'], {
          status: 'RECONCILIATION_PENDING'
        })
      };
    }
    const next = await this.store.transition(attempt.id, ['PROCESSING'], {
      status: result.status,
      gatewayPaymentId: result.gatewayPaymentId,
      failureCode: result.denialReason
    });
    if (result.status === 'APPROVED') {
      await this.store.markLinkPaid(next.checkoutLinkId);
      if (this.outbox) {
        await this.outbox.enqueue({
          merchantId: next.merchantId,
          kind: 'PAYMENT_RECEIPT',
          idempotencyKey: `receipt:card:${next.id}`,
          recipient: input.payerEmail ?? 'comprovante@baas.local',
          payload: {
            attemptId: next.id,
            checkoutLinkId: next.checkoutLinkId,
            gatewayPaymentId: next.gatewayPaymentId,
            cardBrand: next.cardBrand,
            cardLast4: next.cardLast4,
            amountCents: input.quote.grossAmountCents,
            method: 'CARD',
            text: `Comprovante de pagamento Cartão (${next.cardBrand} **** ${next.cardLast4}) aprovado (Ref: ${next.externalReference})`
          }
        });
      }
    }
    return { httpStatus: 201, attempt: next };
  }
  private async currentFee(brand: CardBrand, installments: number): Promise<GatewayFee> {
    if (!Number.isInteger(installments) || installments < 1 || installments > 21)
      throw new CardPaymentError('INSTALLMENTS_INVALID');
    const fee = (await this.fees.list(brand)).find((item) => item.installments === installments);
    if (!fee) throw new CardPaymentError('FEE_NOT_FOUND');
    return fee;
  }
}
function positiveCents(value: string): bigint {
  if (!/^\d+$/u.test(value) || BigInt(value) <= 0n) throw new CardPaymentError('AMOUNT_INVALID');
  return BigInt(value);
}
function digits(value: string) {
  return value.replace(/\D/gu, '');
}
function validateCard(card: CardConfirmInput['card'], now: Date) {
  const number = digits(card.number);
  if (!/^\d{13,19}$/u.test(number) || !luhn(number)) throw new CardPaymentError('CARD_INVALID');
  if (!/^\d{3,4}$/u.test(card.cvv)) throw new CardPaymentError('CARD_INVALID');
  if (card.holder.trim().length < 2 || card.holder.trim().length > 100)
    throw new CardPaymentError('CARD_INVALID');
  if (!Number.isInteger(card.expiryMonth) || card.expiryMonth < 1 || card.expiryMonth > 12)
    throw new CardPaymentError('CARD_INVALID');
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  if (card.expiryYear * 12 + card.expiryMonth < currentMonth)
    throw new CardPaymentError('CARD_INVALID');
}
function luhn(number: string) {
  let sum = 0;
  let double = false;
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = Number(number[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
