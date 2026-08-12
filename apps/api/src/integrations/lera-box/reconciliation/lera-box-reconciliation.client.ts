import { LeraBoxDependencyError, LeraBoxIdentityClient } from '../auth/lera-box-identity.client.js';

export type GatewayFinancialStatus = 'APPROVED' | 'DENIED' | 'PENDING' | 'EXPIRED';
export interface GatewayFinancialRecord {
  id: string;
  externalReference: string;
  amountCents: string;
  status: GatewayFinancialStatus;
}

export class LeraBoxReconciliationClient {
  private readonly http: LeraBoxIdentityClient;

  constructor(baseUrl: string, request: typeof fetch = fetch, timeoutMs = 5_000) {
    this.http = new LeraBoxIdentityClient(baseUrl, request, timeoutMs);
  }

  getPayment(accessToken: string, id: string): Promise<GatewayFinancialRecord> {
    return this.get(accessToken, `/api/payments/${encodeURIComponent(id)}`, 'get-payment');
  }

  getWithdrawal(accessToken: string, id: string): Promise<GatewayFinancialRecord> {
    return this.get(accessToken, `/api/withdrawals/${encodeURIComponent(id)}`, 'get-withdrawal');
  }

  async listStatement(accessToken: string): Promise<GatewayFinancialRecord[]> {
    const response = await this.http.send(
      'list-statement',
      '/api/wallet/transactions',
      { headers: { authorization: `Bearer ${accessToken}` } },
      200
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (!Array.isArray(body.transactions)) throw malformed('list-statement');
    return body.transactions.map((item) => parse(item, 'list-statement'));
  }

  private async get(accessToken: string, path: string, operation: string) {
    const response = await this.http.send(
      operation,
      path,
      { headers: { authorization: `Bearer ${accessToken}` } },
      200
    );
    return parse(await response.json(), operation);
  }
}

function parse(value: unknown, operation: string): GatewayFinancialRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed(operation);
  const body = value as Record<string, unknown>;
  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};
  const externalReference = body.externalReference ?? metadata.externalReference;
  if (
    typeof body.id !== 'string' ||
    typeof externalReference !== 'string' ||
    !Number.isSafeInteger(body.amount) ||
    !['APPROVED', 'DENIED', 'PENDING', 'EXPIRED'].includes(String(body.status))
  ) {
    throw malformed(operation);
  }
  return {
    id: body.id,
    externalReference,
    amountCents: String(body.amount),
    status: body.status as GatewayFinancialStatus
  };
}

function malformed(operation: string) {
  return new LeraBoxDependencyError(operation, 'LERA_BOX_MALFORMED_RESPONSE');
}
