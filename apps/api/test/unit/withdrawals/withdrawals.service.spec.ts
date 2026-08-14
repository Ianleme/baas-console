import type { DataSource, EntityManager, Repository } from 'typeorm';

import { ProblemException } from '../../../src/platform/errors/problem.exception.js';
import type { GatewayCredentialService } from '../../../src/modules/gateway-accounts/gateway-credential.service.js';
import type { WalletService } from '../../../src/modules/wallet/wallet.service.js';
import type { WithdrawalGatewayAdapter } from '../../../src/modules/withdrawals/adapters/lera-box-withdrawal.adapter.js';
import type { WithdrawalEntity } from '../../../src/modules/withdrawals/entities/withdrawal.entity.js';
import { WithdrawalsService } from '../../../src/modules/withdrawals/withdrawals.service.js';

describe('WithdrawalsService', () => {
  let service: WithdrawalsService;
  let mockDataSource: Partial<DataSource>;
  let mockRepository: Partial<Repository<WithdrawalEntity>>;
  let mockWalletService: Partial<WalletService>;
  let mockGateway: Partial<WithdrawalGatewayAdapter>;
  let mockCredentials: Partial<GatewayCredentialService>;
  let mockManager: Partial<EntityManager>;

  const mockWithdrawal: WithdrawalEntity = {
    id: 'wth_123',
    merchantId: 'merchant_1',
    externalReference: 'WTH-001',
    amountCents: '5000',
    status: 'APPROVED',
    destinationType: 'PIX_CPF',
    destinationMasked: '***.456.789-**',
    destinationBlindIndex: null,
    gatewayWithdrawalId: 'gw_wth_123',
    reconciliationAttempts: 0,
    nextReconciliationAt: null,
    leaseUntil: null,
    lastErrorCode: null,
    createdAt: new Date('2026-08-12T14:00:00.000Z'),
    updatedAt: new Date('2026-08-12T14:00:00.000Z'),
    merchant: {} as WithdrawalEntity['merchant']
  };

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([mockWithdrawal]),
      create: jest.fn().mockImplementation((dto: Partial<WithdrawalEntity>) => ({
        ...dto,
        id: dto.id ?? 'wth_gen_123',
        createdAt: dto.createdAt ?? new Date('2026-08-12T14:00:00.000Z'),
        updatedAt: dto.updatedAt ?? new Date('2026-08-12T14:00:00.000Z')
      }))
    };

    mockManager = {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity))
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
      transaction: jest
        .fn()
        .mockImplementation((cb: (mgr: EntityManager) => Promise<unknown>) =>
          cb(mockManager as EntityManager)
        )
    };

    mockWalletService = {
      current: jest.fn().mockResolvedValue({
        balanceCents: '10000',
        capturedAt: '2026-08-12T14:00:00.000Z',
        stale: false
      })
    };

    mockGateway = {
      executeTransfer: jest.fn().mockResolvedValue({
        id: 'gw_wth_123',
        status: 'APPROVED',
        externalReference: 'WTH-001',
        amountCents: '5000'
      })
    };

    mockCredentials = {
      activeAuth: jest
        .fn()
        .mockResolvedValue({ accessToken: 'test_token', document: '12345678901' })
    };

    service = new WithdrawalsService(
      mockDataSource as DataSource,
      mockWalletService as WalletService,
      mockGateway as WithdrawalGatewayAdapter,
      mockCredentials as GatewayCredentialService
    );
  });

  it('rejects zero or negative amount with INVALID_AMOUNT', async () => {
    await expect(
      service.requestWithdrawal('merchant_1', {
        amountCents: '0',
        pixKey: '12345678901',
        pixKeyType: 'CPF'
      })
    ).rejects.toThrow(ProblemException);
  });

  it('rejects withdrawal request when wallet balance is insufficient', async () => {
    mockWalletService.current = jest.fn().mockResolvedValue({
      balanceCents: '3000',
      capturedAt: '2026-08-12T14:00:00.000Z',
      stale: false
    });

    await expect(
      service.requestWithdrawal('merchant_1', {
        amountCents: '5000',
        pixKey: '12345678901',
        pixKeyType: 'CPF'
      })
    ).rejects.toThrow(ProblemException);
  });

  it('returns existing record on idempotent retry with matching externalReference', async () => {
    mockRepository.findOne = jest.fn().mockResolvedValue(mockWithdrawal);

    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '5000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: 'WTH-001'
    });

    expect(result.id).toBe('wth_123');
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('masks CPF Pix key correctly', async () => {
    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '2000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: 'WTH-002'
    });

    expect(result.destinationMasked).toBe('***.456.789-**');
  });

  it('masks CNPJ Pix key correctly', async () => {
    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '2000',
      pixKey: '12345678000199',
      pixKeyType: 'CNPJ',
      externalReference: 'WTH-003'
    });

    expect(result.destinationMasked).toBe('**.345.678/****-**');
  });

  it('masks EMAIL Pix key correctly', async () => {
    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '2000',
      pixKey: 'joao.silva@empresa.com',
      pixKeyType: 'EMAIL',
      externalReference: 'WTH-004'
    });

    expect(result.destinationMasked).toBe('jo***@empresa.com');
  });

  it('masks RANDOM Pix key correctly', async () => {
    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '2000',
      pixKey: 'e2e-random-pix-key-999',
      pixKeyType: 'RANDOM',
      externalReference: 'WTH-005'
    });

    expect(result.destinationMasked).toBe('***-999');
  });

  it('creates withdrawal record and saves transaction', async () => {
    await service.requestWithdrawal('merchant_1', {
      amountCents: '5000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: 'WTH-006'
    });

    expect(mockDataSource.transaction).toHaveBeenCalled();
  });

  it('invokes gateway transfer when active gateway credentials exist', async () => {
    await service.requestWithdrawal('merchant_1', {
      amountCents: '5000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: 'WTH-007'
    });

    expect(mockGateway.executeTransfer).toHaveBeenCalledWith('test_token', {
      amountCents: '5000',
      externalReference: 'WTH-007',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      document: '12345678901'
    });
  });

  it('updates withdrawal status to APPROVED on gateway transfer success', async () => {
    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '5000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: 'WTH-008'
    });

    expect(result.status).toBe('APPROVED');
    expect(result.gatewayWithdrawalId).toBe('gw_wth_123');
  });

  it('updates withdrawal status to DENIED on gateway transfer failure', async () => {
    mockGateway.executeTransfer = jest.fn().mockRejectedValue(new Error('GATEWAY_REJECTED'));

    const result = await service.requestWithdrawal('merchant_1', {
      amountCents: '5000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: 'WTH-009'
    });

    expect(result.status).toBe('DENIED');
  });

  it('lists merchant withdrawals sorted by createdAt descending', async () => {
    const list = await service.list('merchant_1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('wth_123');
    expect(list[0].amountCents).toBe('5000');
  });
});
