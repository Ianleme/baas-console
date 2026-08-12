import type { DataSource, SelectQueryBuilder } from 'typeorm';
import type { GatewayCredentialService } from '../../../src/modules/gateway-accounts/gateway-credential.service.js';
import type { StatementGatewayAdapter } from '../../../src/modules/transactions/adapters/lera-box-statement.adapter.js';
import { TransactionEntity } from '../../../src/modules/transactions/entities/transaction.entity.js';
import { TransactionsService } from '../../../src/modules/transactions/transactions.service.js';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let mockQueryBuilder: Record<string, ReturnType<typeof vi.fn>>;
  let mockDataSource: Partial<DataSource>;
  let mockGateway: Partial<StatementGatewayAdapter>;
  let mockCredentials: Partial<GatewayCredentialService>;

  const mockTransaction: TransactionEntity = {
    id: 'tx_123',
    merchantId: 'merchant_1',
    originType: 'PAYMENT',
    originId: 'pay_123',
    externalReference: 'REF-123456',
    gatewayTransactionId: 'gw_123',
    type: 'CREDIT',
    status: 'PENDING',
    grossAmountCents: '10000',
    feeAmountCents: '300',
    netAmountCents: '9700',
    occurredAt: new Date('2026-08-12T14:00:00.000Z'),
    projectionVersion: 1,
    receiptTokenHash: null,
    receiptTokenCiphertext: null,
    receiptTokenExpiresAt: null,
    receiptTokenRevokedAt: null,
    receiptTokenVersion: 0,
    createdAt: new Date('2026-08-12T14:00:00.000Z'),
    updatedAt: new Date('2026-08-12T14:00:00.000Z'),
    merchant: undefined as any
  };

  beforeEach(() => {
    mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[mockTransaction], 1])
    };

    mockDataSource = {
      getRepository: vi.fn().mockReturnValue({
        createQueryBuilder: vi
          .fn()
          .mockReturnValue(mockQueryBuilder as unknown as SelectQueryBuilder<TransactionEntity>)
      }) as any
    };

    mockGateway = {
      listStatement: vi.fn().mockResolvedValue([])
    };

    mockCredentials = {
      getActiveGatewayAuth: vi.fn().mockResolvedValue({ accessToken: 'test_token' })
    };

    service = new TransactionsService(
      mockDataSource as DataSource,
      mockGateway as StatementGatewayAdapter,
      mockCredentials as GatewayCredentialService
    );
  });

  it('queries database with tenant merchantId filter', async () => {
    await service.list('merchant_1', { limit: 50, offset: 0 });
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('tx.merchantId = :merchantId', {
      merchantId: 'merchant_1'
    });
  });

  it('returns items, total, capturedAt timestamp, and stale indicator', async () => {
    const result = await service.list('merchant_1', { limit: 50, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.stale).toBe(false);
    expect(typeof result.capturedAt).toBe('string');
  });

  it('applies status filter when provided', async () => {
    await service.list('merchant_1', { status: 'APPROVED', limit: 50, offset: 0 });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tx.status = :status', {
      status: 'APPROVED'
    });
  });

  it('applies type filter when provided', async () => {
    await service.list('merchant_1', { type: 'CREDIT', limit: 50, offset: 0 });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tx.type = :type', { type: 'CREDIT' });
  });

  it('applies originType filter when provided', async () => {
    await service.list('merchant_1', { originType: 'PAYMENT', limit: 50, offset: 0 });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tx.originType = :originType', {
      originType: 'PAYMENT'
    });
  });

  it('applies case-insensitive reference search filter when provided', async () => {
    await service.list('merchant_1', { reference: 'ref-123', limit: 50, offset: 0 });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER(tx.externalReference) LIKE LOWER(:ref)',
      { ref: '%ref-123%' }
    );
  });

  it('applies limit and offset pagination parameters', async () => {
    await service.list('merchant_1', { limit: 20, offset: 10 });
    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
  });

  it('merges remote APPROVED status update into matching local transaction', async () => {
    mockGateway.listStatement = vi
      .fn()
      .mockResolvedValue([
        { id: 'gw_123', externalReference: 'REF-123456', amountCents: '10000', status: 'APPROVED' }
      ]);
    const result = await service.list('merchant_1', { limit: 50, offset: 0 });
    expect(result.items[0].status).toBe('APPROVED');
  });

  it('merges remote DENIED status update into matching local transaction', async () => {
    mockGateway.listStatement = vi
      .fn()
      .mockResolvedValue([
        { id: 'gw_123', externalReference: 'REF-123456', amountCents: '10000', status: 'DENIED' }
      ]);
    const result = await service.list('merchant_1', { limit: 50, offset: 0 });
    expect(result.items[0].status).toBe('DENIED');
  });

  it('flags stale as true when gateway request fails without crashing', async () => {
    mockGateway.listStatement = vi.fn().mockRejectedValue(new Error('GATEWAY_TIMEOUT'));
    const result = await service.list('merchant_1', { limit: 50, offset: 0 });
    expect(result.stale).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('serializes gross, fee, and net amounts in string cents format', async () => {
    const result = await service.list('merchant_1', { limit: 50, offset: 0 });
    expect(result.items[0].grossAmountCents).toBe('10000');
    expect(result.items[0].feeAmountCents).toBe('300');
    expect(result.items[0].netAmountCents).toBe('9700');
  });
});
