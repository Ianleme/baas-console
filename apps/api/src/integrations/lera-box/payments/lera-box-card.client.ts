import { LeraBoxDependencyError, LeraBoxIdentityClient } from '../auth/lera-box-identity.client.js';
import type { CardBrand } from '../fees/lera-box-fees.client.js';
import { feeBpsToGatewayPercent } from '../fees/lera-box-fees.client.js';

export interface GatewayCardRequest {
  amountCents: string;
  cardNumber: string;
  cardHolder: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  installments: number;
  feeBps: number;
  description: string;
  externalReference: string;
}
export interface GatewayCardResult {
  gatewayPaymentId: string;
  status: 'APPROVED' | 'DENIED' | 'PENDING';
  externalReference: string;
  brand: CardBrand;
  last4: string;
  installments: number;
  feeBps: number;
  feeAmountCents: string;
  netAmountCents: string;
  denialReason: string | null;
}

export class LeraBoxCardClient {
  private readonly http: LeraBoxIdentityClient;
  constructor(baseUrl: string, request: typeof fetch = fetch, timeoutMs = 5_000) {
    this.http = new LeraBoxIdentityClient(baseUrl, request, timeoutMs);
  }
  async create(accessToken: string, input: GatewayCardRequest): Promise<GatewayCardResult> {
    const response = await this.http.send(
      'create-card',
      '/api/payments/card',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: cents(input.amountCents),
          cardNumber: input.cardNumber,
          cardHolder: input.cardHolder,
          expiryMonth: input.expiryMonth,
          expiryYear: input.expiryYear,
          cvv: input.cvv,
          installments: input.installments,
          feePercent: feeBpsToGatewayPercent(input.feeBps),
          description: input.description,
          externalReference: input.externalReference
        })
      },
      201
    );
    const body = (await response.json()) as Record<string, unknown>;
    const metadata = object(body.metadata);
    if (
      typeof body.id !== 'string' ||
      typeof body.externalReference !== 'string' ||
      !['APPROVED', 'DENIED', 'PENDING'].includes(String(body.status)) ||
      !['VISA', 'MASTERCARD', 'ELO'].includes(String(metadata.cardBrand)) ||
      !/^\d{4}$/u.test(String(metadata.cardLast4)) ||
      !Number.isInteger(metadata.installments) ||
      !Number.isInteger(metadata.feeAmountCents) ||
      !Number.isInteger(metadata.netAmountCents)
    )
      throw malformed();
    const feePercent = metadata.feePercent;
    if (typeof feePercent !== 'number' || !Number.isFinite(feePercent)) throw malformed();
    return {
      gatewayPaymentId: body.id,
      status: body.status as GatewayCardResult['status'],
      externalReference: body.externalReference,
      brand: metadata.cardBrand as CardBrand,
      last4: metadata.cardLast4 as string,
      installments: metadata.installments as number,
      feeBps: Math.round(feePercent * 100),
      feeAmountCents: String(metadata.feeAmountCents),
      netAmountCents: String(metadata.netAmountCents),
      denialReason: optionalString(body.denialReason)
    };
  }
}
function cents(value: string): number {
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) throw malformed();
  return parsed;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed();
  return value as Record<string, unknown>;
}
function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw malformed();
  return value;
}
function malformed() {
  return new LeraBoxDependencyError('create-card', 'LERA_BOX_MALFORMED_RESPONSE');
}
