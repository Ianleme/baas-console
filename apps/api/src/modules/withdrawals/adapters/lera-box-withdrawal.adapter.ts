import { LeraBoxReconciliationClient } from '../../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';

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

  async executeTransfer(
    _accessToken: string,
    params: {
      amountCents: string;
      externalReference: string;
      pixKey: string;
      pixKeyType: string;
    }
  ): Promise<WithdrawalTransferResult> {
    // Simulated remote payout transfer using gateway reconciliation client conventions
    const id = `wth_gw_${Date.now()}`;
    return {
      id,
      status: 'APPROVED',
      externalReference: params.externalReference,
      amountCents: params.amountCents
    };
  }
}
