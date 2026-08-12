import type {
  GatewayFinancialRecord,
  LeraBoxReconciliationClient
} from '../../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';

export interface StatementGatewayAdapter {
  listStatement(accessToken: string): Promise<GatewayFinancialRecord[]>;
}

export class LeraBoxStatementAdapter implements StatementGatewayAdapter {
  constructor(private readonly client: LeraBoxReconciliationClient) {}

  listStatement(accessToken: string): Promise<GatewayFinancialRecord[]> {
    return this.client.listStatement(accessToken);
  }
}
