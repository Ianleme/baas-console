import { ProblemException } from '../../src/platform/errors/problem.exception.js';
import {
  TransactionsController,
  type TransactionsPrincipalProvider
} from '../../src/modules/transactions/transactions.controller.js';
import type { TransactionsService } from '../../src/modules/transactions/transactions.service.js';
import type { Response } from 'express';

describe('TransactionsController receipt endpoints', () => {
  let mockService: TransactionsService;
  let mockPrincipal: TransactionsPrincipalProvider;
  let controller: TransactionsController;

  const mockItem = {
    id: 'tx-1',
    originType: 'PAYMENT' as const,
    originId: 'link-1',
    externalReference: 'REF-100',
    gatewayTransactionId: 'gw-100',
    type: 'CREDIT' as const,
    status: 'APPROVED' as const,
    grossAmountCents: '10000',
    feeAmountCents: '299',
    netAmountCents: '9701',
    occurredAt: '2026-08-12T10:00:00.000Z'
  };

  beforeEach(() => {
    mockPrincipal = {
      current: jest.fn().mockReturnValue({ merchantId: 'merchant-1' })
    };

    mockService = {
      findById: jest.fn().mockImplementation((merchantId: string, id: string) => {
        if (merchantId === 'merchant-1' && id === 'tx-1') {
          return Promise.resolve(mockItem);
        }
        return Promise.resolve(null);
      })
    } as unknown as TransactionsService;

    controller = new TransactionsController(mockService, mockPrincipal);
  });

  it('returns transaction detail when owned by merchant', async () => {
    const detail = await controller.getDetail('tx-1');
    expect(detail).toEqual(mockItem);
  });

  it('throws 404 ProblemException if transaction detail is not found', async () => {
    await expect(controller.getDetail('tx-999')).rejects.toThrow(ProblemException);
  });

  it('streams HTML receipt with text/html content-type header', async () => {
    const setHeader = jest.fn();
    const send = jest.fn();
    const mockRes = { setHeader, send } as unknown as Response;

    await controller.getReceipt('tx-1', mockRes);

    expect(setHeader).toHaveBeenCalledWith('content-type', 'text/html; charset=utf-8');
    expect(send).toHaveBeenCalledWith(expect.stringContaining('REF-100'));
  });

  it('throws 404 when receipt for non-existing transaction is requested', async () => {
    const setHeader = jest.fn();
    const send = jest.fn();
    const mockRes = { setHeader, send } as unknown as Response;

    await expect(controller.getReceipt('tx-999', mockRes)).rejects.toThrow(ProblemException);
  });
});
