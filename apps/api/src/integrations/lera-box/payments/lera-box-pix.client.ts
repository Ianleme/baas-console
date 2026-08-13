import { LeraBoxDependencyError, LeraBoxIdentityClient } from '../auth/lera-box-identity.client.js';

export interface GatewayPixRequest {
  amountCents: string;
  payerDocument: string;
  description: string;
  externalReference: string;
}
export interface GatewayPixResult {
  gatewayPaymentId: string;
  status: 'APPROVED' | 'DENIED' | 'PENDING';
  externalReference: string;
  txid: string | null;
  emv: string | null;
  qrCodeBase64: string | null;
  denialReason: string | null;
}
export class LeraBoxPixClient {
  private readonly http: LeraBoxIdentityClient;
  constructor(baseUrl: string, request: typeof fetch = fetch, timeoutMs = 5_000) {
    this.http = new LeraBoxIdentityClient(baseUrl, request, timeoutMs);
  }
  async create(accessToken: string, input: GatewayPixRequest): Promise<GatewayPixResult> {
    const response = await this.http.send(
      'create-pix',
      '/api/payments/pix',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: cents(input.amountCents),
          payerDocument: input.payerDocument,
          description: input.description,
          externalReference: input.externalReference
        })
      },
      201
    );
    const body = (await response.json()) as Record<string, unknown>;
    const metadata = objectOrEmpty(body.metadata);
    const externalReference = body.externalReference ?? metadata.externalReference;
    if (
      typeof body.id !== 'string' ||
      !['APPROVED', 'DENIED', 'PENDING'].includes(String(body.status)) ||
      typeof externalReference !== 'string'
    )
      throw malformed();
    return {
      gatewayPaymentId: body.id,
      status: body.status as GatewayPixResult['status'],
      externalReference,
      txid: optionalString(metadata.txid),
      emv: optionalString(body.emv ?? metadata.emv),
      qrCodeBase64: optionalString(body.qrCodeBase64 ?? metadata.qrCodeBase64),
      denialReason: optionalString(body.denialReason)
    };
  }
}
function cents(value: string): number {
  if (!/^\d+$/u.test(value)) throw malformed();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw malformed();
  return parsed;
}
function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw malformed();
  return value;
}
function objectOrEmpty(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed();
  return value as Record<string, unknown>;
}
function malformed() {
  return new LeraBoxDependencyError('create-pix', 'LERA_BOX_MALFORMED_RESPONSE');
}
