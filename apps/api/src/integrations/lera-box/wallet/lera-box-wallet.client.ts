import { LeraBoxDependencyError, LeraBoxIdentityClient } from '../auth/lera-box-identity.client.js';

export interface GatewayWalletSnapshot {
  balanceCents: string;
  capturedAt: Date;
  sourceRequestId: string | null;
}

export class LeraBoxWalletClient {
  private readonly http: LeraBoxIdentityClient;

  constructor(baseUrl: string, request: typeof fetch = fetch, timeoutMs = 5_000) {
    this.http = new LeraBoxIdentityClient(baseUrl, request, timeoutMs);
  }

  async getWallet(accessToken: string): Promise<GatewayWalletSnapshot> {
    const response = await this.http.send(
      'get-wallet',
      '/api/wallet',
      { headers: { authorization: `Bearer ${accessToken}` } },
      200
    );
    const value = (await response.json()) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed();
    const body = value as Record<string, unknown>;
    const capturedAt = typeof body.updatedAt === 'string' ? new Date(body.updatedAt) : null;
    if (
      !Number.isSafeInteger(body.balance) ||
      Number(body.balance) < 0 ||
      !capturedAt ||
      Number.isNaN(capturedAt.getTime()) ||
      (body.id !== undefined && typeof body.id !== 'string')
    ) {
      throw malformed();
    }
    return {
      balanceCents: String(body.balance),
      capturedAt,
      sourceRequestId: typeof body.id === 'string' ? body.id : null
    };
  }
}

function malformed(): LeraBoxDependencyError {
  return new LeraBoxDependencyError('get-wallet', 'LERA_BOX_MALFORMED_RESPONSE');
}
