import {
  LeraBoxDependencyError,
  LeraBoxIdentityClient
} from '../../../integrations/lera-box/auth/lera-box-identity.client.js';

export interface WithdrawalTransferResult {
  id: string;
  status: 'APPROVED' | 'DENIED' | 'PENDING';
  externalReference: string;
  amountCents: string;
}

export interface WithdrawalGatewayAdapter {
  executeTransfer(
    accessToken: string,
    params: {
      amountCents: string;
      externalReference: string;
      pixKey: string;
      pixKeyType: string;
      document: string;
    }
  ): Promise<WithdrawalTransferResult>;
}

export class LeraBoxWithdrawalAdapter implements WithdrawalGatewayAdapter {
  constructor(private readonly http: Pick<LeraBoxIdentityClient, 'send'>) {}

  async executeTransfer(
    accessToken: string,
    params: {
      amountCents: string;
      externalReference: string;
      pixKey: string;
      pixKeyType: string;
      document: string;
    }
  ): Promise<WithdrawalTransferResult> {
    const amount = Number(params.amountCents);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw malformed();
    const response = await this.http.send(
      'create-withdrawal',
      '/api/withdrawals',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          amount,
          pixKey: params.pixKey,
          description: `Saque ${params.externalReference}`,
          externalReference: params.externalReference,
          document: params.document.replace(/\D/g, '')
        })
      },
      201
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (
      typeof body.id !== 'string' ||
      !['APPROVED', 'DENIED', 'PENDING'].includes(String(body.status)) ||
      typeof body.externalReference !== 'string' ||
      !Number.isSafeInteger(body.amount)
    ) {
      throw malformed();
    }
    return {
      id: body.id,
      status: body.status as WithdrawalTransferResult['status'],
      externalReference: body.externalReference,
      amountCents: String(body.amount)
    };
  }
}

function malformed(): LeraBoxDependencyError {
  return new LeraBoxDependencyError('create-withdrawal', 'LERA_BOX_MALFORMED_RESPONSE');
}
