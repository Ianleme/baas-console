import { ProblemException } from '../../src/platform/errors/problem.exception.js';
import {
  EmailDeliveriesController,
  type EmailDeliveriesPrincipalProvider
} from '../../src/modules/notifications/email-deliveries.controller.js';
import type { EmailOutboxService } from '../../src/modules/notifications/email-outbox.service.js';

describe('EmailDeliveriesController', () => {
  let mockService: EmailOutboxService;
  let mockPrincipal: EmailDeliveriesPrincipalProvider;
  let controller: EmailDeliveriesController;
  let listDeliveriesMock: jest.Mock;
  let retryDeadLetterMock: jest.Mock;

  const mockItem = {
    id: 'del-1',
    kind: 'PAYMENT_RECEIPT',
    idempotencyKey: 'key-1',
    recipientMasked: 'c***@loja.com',
    status: 'DEAD_LETTER',
    attempts: 5,
    nextAttemptAt: null,
    lastErrorCode: 'SMTP_FAIL',
    createdAt: '2026-08-12T10:00:00.000Z'
  };

  beforeEach(() => {
    mockPrincipal = {
      current: jest.fn().mockReturnValue({ merchantId: 'merchant-1' })
    };

    listDeliveriesMock = jest.fn().mockResolvedValue({ items: [mockItem], total: 1 });
    retryDeadLetterMock = jest.fn().mockImplementation((merchantId: string, id: string) => {
      if (merchantId === 'merchant-1' && id === 'del-1') {
        return Promise.resolve({ ...mockItem, status: 'QUEUED', attempts: 0 });
      }
      if (id === 'not-found') {
        return Promise.reject(new Error('DELIVERY_NOT_FOUND'));
      }
      return Promise.reject(new Error('DELIVERY_NOT_RETRYABLE'));
    });

    mockService = {
      listDeliveries: listDeliveriesMock,
      retryDeadLetter: retryDeadLetterMock
    } as unknown as EmailOutboxService;

    controller = new EmailDeliveriesController(mockService, mockPrincipal);
  });

  it('lists email outbox deliveries for active merchant tenant', async () => {
    const res = await controller.list('DEAD_LETTER', 10, 0);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.status).toBe('DEAD_LETTER');
    expect(listDeliveriesMock).toHaveBeenCalledWith('merchant-1', {
      status: 'DEAD_LETTER',
      limit: 10,
      offset: 0
    });
  });

  it('resets a dead-letter delivery to QUEUED state on manual retry', async () => {
    const res = await controller.retry('del-1');
    expect(res.status).toBe('QUEUED');
    expect(res.attempts).toBe(0);
    expect(retryDeadLetterMock).toHaveBeenCalledWith('merchant-1', 'del-1');
  });

  it('throws 404 ProblemException when delivery record is not found', async () => {
    await expect(controller.retry('not-found')).rejects.toThrow(ProblemException);
  });

  it('throws 400 ProblemException when delivery is not in retryable status', async () => {
    await expect(controller.retry('del-already-sent')).rejects.toThrow(ProblemException);
  });
});
