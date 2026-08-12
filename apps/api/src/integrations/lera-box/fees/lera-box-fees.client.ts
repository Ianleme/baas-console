import { LeraBoxDependencyError, LeraBoxIdentityClient } from '../auth/lera-box-identity.client.js';

export const CARD_BRANDS = ['VISA', 'MASTERCARD', 'ELO'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export interface GatewayFee {
  id: string;
  brand: CardBrand;
  installments: number;
  feeBps: number;
}

export class LeraBoxFeesClient {
  private readonly http: LeraBoxIdentityClient;

  constructor(baseUrl: string, request: typeof fetch = fetch, timeoutMs = 5_000) {
    this.http = new LeraBoxIdentityClient(baseUrl, request, timeoutMs);
  }

  async list(brand?: CardBrand): Promise<GatewayFee[]> {
    const query = brand ? `?brand=${encodeURIComponent(brand)}` : '';
    const response = await this.http.send('get-fees', `/api/fees${query}`, {}, 200);
    const body = (await response.json()) as Record<string, unknown>;
    if (
      !Array.isArray(body.fees) ||
      !Number.isInteger(body.total) ||
      Number(body.total) < body.fees.length
    ) {
      throw this.malformed();
    }
    const fees = body.fees.map((value) => this.normalize(value));
    if (brand && fees.some((fee) => fee.brand !== brand)) throw this.malformed();
    return fees;
  }

  private normalize(value: unknown): GatewayFee {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.malformed();
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !CARD_BRANDS.includes(row.brand as CardBrand)) {
      throw this.malformed();
    }
    if (
      !Number.isInteger(row.installments) ||
      Number(row.installments) < 1 ||
      Number(row.installments) > 21
    ) {
      throw this.malformed();
    }
    return {
      id: row.id,
      brand: row.brand as CardBrand,
      installments: Number(row.installments),
      feeBps: feePercentToBps(row.feePercent)
    };
  }

  private malformed(): LeraBoxDependencyError {
    return new LeraBoxDependencyError('get-fees', 'LERA_BOX_MALFORMED_RESPONSE');
  }
}

export function feePercentToBps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)
    throw malformedFee();
  const fixed = value.toFixed(2);
  if (Math.abs(value - Number(fixed)) > Number.EPSILON) throw malformedFee();
  const [whole = '', fraction = ''] = fixed.split('.');
  const bps = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction, 10);
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) throw malformedFee();
  return bps;
}

export function feeBpsToGatewayPercent(feeBps: number): number {
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw malformedFee();
  return Number(`${String(Math.floor(feeBps / 100))}.${String(feeBps % 100).padStart(2, '0')}`);
}

function malformedFee(): LeraBoxDependencyError {
  return new LeraBoxDependencyError('get-fees', 'LERA_BOX_MALFORMED_RESPONSE');
}
