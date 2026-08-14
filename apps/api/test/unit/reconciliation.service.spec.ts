import {
  ReconciliationError,
  ReconciliationService,
  type LocalFinancialOperation,
  type ReconciliationStore
} from '../../src/modules/reconciliation/reconciliation.service.js';

const local: LocalFinancialOperation = {
  id: 'operation-id',
  merchantId: 'merchant-a',
  kind: 'PAYMENT',
  externalReference: 'REF-1',
  gatewayId: 'gateway-id',
  amountCents: '100',
  status: 'RECONCILIATION_PENDING'
};
const remote = {
  id: 'gateway-id',
  externalReference: 'REF-1',
  amountCents: '100',
  status: 'APPROVED' as const
};

function setup(overrides: Partial<LocalFinancialOperation> = {}) {
  const operation = { ...local, ...overrides };
  const gateway = {
    getPayment: jest.fn().mockResolvedValue(remote),
    getWithdrawal: jest.fn().mockResolvedValue(remote),
    listStatement: jest.fn().mockResolvedValue([])
  };
  const store: jest.Mocked<ReconciliationStore> = {
    find: jest.fn().mockResolvedValue(operation),
    findByExternalReference: jest.fn().mockResolvedValue(operation),
    applyOutcome: jest.fn().mockResolvedValue(true),
    markReview: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined)
  };
  return { gateway, store, service: new ReconciliationService(gateway, store) };
}

describe('ReconciliationService', () => {
  test.each(['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'])(
    'matches and applies final outcome from local %s',
    async (status) => {
      const { service, store } = setup({ status });
      await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe('MATCHED');
      expect(store.applyOutcome).toHaveBeenCalledWith(
        'merchant-a',
        'operation-id',
        ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'],
        'APPROVED',
        'gateway-id'
      );
    }
  );
  test.each(['APPROVED', 'DENIED', 'EXPIRED'] as const)(
    'accepts idempotent terminal %s result',
    async (status) => {
      const { service, store, gateway } = setup({ status });
      gateway.getPayment.mockResolvedValue({ ...remote, status });
      store.applyOutcome.mockResolvedValue(false);
      await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe('MATCHED');
      expect(store.markReview).not.toHaveBeenCalled();
    }
  );
  test.each([
    [{ externalReference: 'OTHER' }, 'REMOTE_FIELDS_MISMATCH'],
    [{ amountCents: '101' }, 'REMOTE_FIELDS_MISMATCH']
  ])('classifies mismatched fields %#', async (change, reason) => {
    const { service, gateway, store } = setup();
    gateway.getPayment.mockResolvedValue({ ...remote, ...change });
    await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe('MISMATCH');
    expect(store.markReview).toHaveBeenCalledWith('merchant-a', 'operation-id', reason);
  });
  test('classifies a non-final gateway result for manual review', async () => {
    const { service, gateway, store } = setup();
    gateway.getPayment.mockResolvedValue({ ...remote, status: 'PENDING' });
    await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe(
      'MANUAL_REVIEW'
    );
    expect(store.markReview).toHaveBeenCalledWith(
      'merchant-a',
      'operation-id',
      'REMOTE_STATUS_NOT_FINAL'
    );
  });
  test('classifies terminal conflict for manual review without overwriting it', async () => {
    const { service, store } = setup({ status: 'DENIED' });
    store.applyOutcome.mockResolvedValue(false);
    await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe(
      'MANUAL_REVIEW'
    );
    expect(store.markReview).toHaveBeenCalledWith(
      'merchant-a',
      'operation-id',
      'TERMINAL_STATUS_CONFLICT'
    );
  });
  test('uses withdrawal GET for withdrawals', async () => {
    const { service, gateway } = setup({ kind: 'WITHDRAWAL' });
    await service.verify('merchant-a', 'operation-id', 'access');
    expect(gateway.getWithdrawal).toHaveBeenCalledWith('access', 'gateway-id');
    expect(gateway.getPayment).not.toHaveBeenCalled();
  });
  test('finds missing gateway id by statement external reference', async () => {
    const { service, gateway } = setup({ gatewayId: null });
    gateway.listStatement.mockResolvedValue([remote]);
    await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe('MATCHED');
    expect(gateway.listStatement).toHaveBeenCalledWith('access');
  });
  test('classifies a local operation absent from statement as LOCAL_ONLY', async () => {
    const { service, store } = setup({ gatewayId: null });
    await expect(service.verify('merchant-a', 'operation-id', 'access')).resolves.toBe(
      'LOCAL_ONLY'
    );
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'LOCAL_ONLY', observedStatus: null })
    );
  });
  test('hides missing and cross-tenant operations as not found', async () => {
    const { service, store } = setup();
    store.find.mockResolvedValue(undefined);
    await expect(service.verify('merchant-b', 'operation-id', 'access')).rejects.toBeInstanceOf(
      ReconciliationError
    );
  });
  test('classifies unmatched statement entries as GATEWAY_ONLY', async () => {
    const { service, gateway, store } = setup();
    gateway.listStatement.mockResolvedValue([remote]);
    store.findByExternalReference.mockResolvedValue(undefined);
    await expect(service.scanStatement('merchant-a', 'access')).resolves.toEqual(['GATEWAY_ONLY']);
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: null, classification: 'GATEWAY_ONLY' })
    );
  });
  test('classifies a unique locally known statement entry as MATCHED', async () => {
    const { service, gateway } = setup();
    gateway.listStatement.mockResolvedValue([remote]);
    await expect(service.scanStatement('merchant-a', 'access')).resolves.toEqual(['MATCHED']);
  });
  test('classifies duplicate external references as MANUAL_REVIEW', async () => {
    const { service, gateway } = setup();
    gateway.listStatement.mockResolvedValue([remote, { ...remote, id: 'gateway-id-2' }]);
    await expect(service.scanStatement('merchant-a', 'access')).resolves.toEqual([
      'MANUAL_REVIEW',
      'MANUAL_REVIEW'
    ]);
  });
  test('never exposes an API that accepts a manually chosen status', () => {
    const { service } = setup();
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(service))).toEqual([
      'constructor',
      'verify',
      'scanStatement',
      'readRemote',
      'persist'
    ]);
  });
  test('never invokes a financial create operation during reconciliation', async () => {
    const { service, gateway } = setup();
    await service.verify('merchant-a', 'operation-id', 'access');
    expect(Object.keys(gateway).sort()).toEqual(['getPayment', 'getWithdrawal', 'listStatement']);
  });
});
