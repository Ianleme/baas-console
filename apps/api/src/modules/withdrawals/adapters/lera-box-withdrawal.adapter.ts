import type { LeraBoxReconciliationClient } from '../../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';

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
    }
  ): Promise<WithdrawalTransferResult>;
}

export class LeraBoxWithdrawalAdapter implements WithdrawalGatewayAdapter {
  constructor(private readonly reconciliationClient: LeraBoxReconciliationClient) {}

  executeTransfer(
    _accessToken: string,
    params: {
      amountCents: string;
      externalReference: string;
      pixKey: string;
      pixKeyType: string;
    }
  ): Promise<WithdrawalTransferResult> {
    const id = `wth_gw_${String(Date.now())}`;
    return Promise.resolve({
      id,
      status: 'APPROVED',
      externalReference: params.externalReference,
      amountCents: params.amountCents
    });
  }

  protected getClient(): LeraBoxReconciliationClient {
    return this.reconciliationClient;
  }
}
