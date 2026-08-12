import type {
  GatewayFinancialRecord,
  GatewayFinancialStatus,
  LeraBoxReconciliationClient
} from '../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';

export type ReconciliationClassification =
  | 'MATCHED'
  | 'MISMATCH'
  | 'LOCAL_ONLY'
  | 'GATEWAY_ONLY'
  | 'MANUAL_REVIEW';

export interface LocalFinancialOperation {
  id: string;
  merchantId: string;
  kind: 'PAYMENT' | 'WITHDRAWAL';
  externalReference: string;
  gatewayId: string | null;
  amountCents: string;
  status: string;
}

export interface ReconciliationStore {
  find(merchantId: string, operationId: string): Promise<LocalFinancialOperation | undefined>;
  findByExternalReference(
    merchantId: string,
    externalReference: string
  ): Promise<LocalFinancialOperation | undefined>;
  applyOutcome(
    merchantId: string,
    operationId: string,
    expectedStatuses: string[],
    status: GatewayFinancialStatus,
    gatewayId: string
  ): Promise<boolean>;
  markReview(merchantId: string, operationId: string, reason: string): Promise<void>;
  record(input: {
    merchantId: string;
    operationId: string | null;
    externalReference: string;
    classification: ReconciliationClassification;
    observedStatus: GatewayFinancialStatus | null;
  }): Promise<void>;
}

export class ReconciliationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ReconciliationError';
  }
}

export class ReconciliationService {
  constructor(
    private readonly gateway: Pick<
      LeraBoxReconciliationClient,
      'getPayment' | 'getWithdrawal' | 'listStatement'
    >,
    private readonly store: ReconciliationStore
  ) {}

  async verify(
    merchantId: string,
    operationId: string,
    accessToken: string
  ): Promise<ReconciliationClassification> {
    const local = await this.store.find(merchantId, operationId);
    if (!local) throw new ReconciliationError('RESOURCE_NOT_FOUND');
    const remote = await this.readRemote(local, accessToken);
    if (!remote) return this.persist(local, null, 'LOCAL_ONLY');
    if (
      remote.externalReference !== local.externalReference ||
      remote.amountCents !== local.amountCents
    ) {
      await this.store.markReview(merchantId, operationId, 'REMOTE_FIELDS_MISMATCH');
      return this.persist(local, remote, 'MISMATCH');
    }
    if (!['APPROVED', 'DENIED', 'EXPIRED'].includes(remote.status)) {
      await this.store.markReview(merchantId, operationId, 'REMOTE_STATUS_NOT_FINAL');
      return this.persist(local, remote, 'MANUAL_REVIEW');
    }
    const applied = await this.store.applyOutcome(
      merchantId,
      operationId,
      ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'],
      remote.status,
      remote.id
    );
    if (!applied && local.status !== remote.status) {
      await this.store.markReview(merchantId, operationId, 'TERMINAL_STATUS_CONFLICT');
      return this.persist(local, remote, 'MANUAL_REVIEW');
    }
    return this.persist(local, remote, 'MATCHED');
  }

  async scanStatement(
    merchantId: string,
    accessToken: string
  ): Promise<ReconciliationClassification[]> {
    const remote = await this.gateway.listStatement(accessToken);
    const counts = new Map<string, number>();
    for (const item of remote)
      counts.set(item.externalReference, (counts.get(item.externalReference) ?? 0) + 1);
    const results: ReconciliationClassification[] = [];
    for (const item of remote) {
      const local = await this.store.findByExternalReference(merchantId, item.externalReference);
      const classification: ReconciliationClassification =
        (counts.get(item.externalReference) ?? 0) > 1
          ? 'MANUAL_REVIEW'
          : local
            ? 'MATCHED'
            : 'GATEWAY_ONLY';
      await this.store.record({
        merchantId,
        operationId: local?.id ?? null,
        externalReference: item.externalReference,
        classification,
        observedStatus: item.status
      });
      results.push(classification);
    }
    return results;
  }

  private async readRemote(local: LocalFinancialOperation, accessToken: string) {
    if (!local.gatewayId) {
      const statement = await this.gateway.listStatement(accessToken);
      return statement.find((item) => item.externalReference === local.externalReference) ?? null;
    }
    return local.kind === 'PAYMENT'
      ? this.gateway.getPayment(accessToken, local.gatewayId)
      : this.gateway.getWithdrawal(accessToken, local.gatewayId);
  }

  private async persist(
    local: LocalFinancialOperation,
    remote: GatewayFinancialRecord | null,
    classification: ReconciliationClassification
  ) {
    await this.store.record({
      merchantId: local.merchantId,
      operationId: local.id,
      externalReference: local.externalReference,
      classification,
      observedStatus: remote?.status ?? null
    });
    return classification;
  }
}
