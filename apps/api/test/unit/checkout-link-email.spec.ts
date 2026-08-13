import { ProblemException } from '../../src/platform/errors/problem.exception.js';
import { CheckoutLinkController } from '../../src/modules/checkout-links/checkout-link.controller.js';
import type { CheckoutLinkService } from '../../src/modules/checkout-links/checkout-link.service.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import type { EmailOutboxService } from '../../src/modules/notifications/email-outbox.service.js';
import type { Request } from 'express';

describe('CheckoutLinkController sendEmail', () => {
  let mockLinksService: CheckoutLinkService;
  let mockAuthService: AuthService;
  let mockOutboxService: EmailOutboxService;
  let enqueueMock: jest.Mock;
  let controller: CheckoutLinkController;

  const mockLink = {
    id: 'link-100',
    merchantId: 'merchant-1',
    publicReference: 'REF-100',
    description: 'Produto Teste',
    amountCents: '5000',
    allowedMethods: 'PIX' as const,
    maxInstallments: 1,
    feeSnapshot: [],
    status: 'ACTIVE' as const,
    expiresAt: new Date('2026-09-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    publicTokenHash: Buffer.from('hash'),
    publicTokenCiphertext: Buffer.from('ciphertext'),
    tokenClosedAt: null
  };

  const mockRequest = {
    headers: { authorization: 'Bearer token-123' }
  } as unknown as Request;

  beforeEach(() => {
    mockAuthService = {
      verifyAccessToken: jest.fn().mockReturnValue({ merchantId: 'merchant-1' })
    } as unknown as AuthService;

    mockLinksService = {
      detail: jest.fn().mockImplementation((merchantId: string, id: string) => {
        if (merchantId === 'merchant-1' && id === 'link-100') {
          return Promise.resolve(mockLink);
        }
        const err = new Error('LINK_NOT_FOUND') as Error & { code: string };
        err.code = 'LINK_NOT_FOUND';
        return Promise.reject(err);
      })
    } as unknown as CheckoutLinkService;

    enqueueMock = jest
      .fn()
      .mockImplementation(
        ({
          merchantId,
          kind,
          idempotencyKey
        }: {
          merchantId: string;
          kind: string;
          idempotencyKey: string;
        }) => {
          return Promise.resolve({
            id: 'del-10',
            merchantId,
            kind,
            idempotencyKey,
            recipientMasked: 'd***@empresa.com',
            status: 'QUEUED'
          });
        }
      );

    mockOutboxService = {
      enqueue: enqueueMock
    } as unknown as EmailOutboxService;

    controller = new CheckoutLinkController(mockLinksService, mockAuthService, mockOutboxService);
  });

  it('enqueues checkout link email delivery and returns masked recipient', async () => {
    const res = await controller.sendEmail(mockRequest, 'link-100', {
      email: 'destinatario@empresa.com'
    });

    expect(res).toEqual({
      deliveryId: 'del-10',
      status: 'QUEUED',
      recipientMasked: 'd***@empresa.com'
    });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'merchant-1',
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'checkout-email:link-100:destinatario@empresa.com',
        recipient: 'destinatario@empresa.com'
      })
    );
  });

  it('throws 404 ProblemException if link is not found or owned by another tenant', async () => {
    await expect(
      controller.sendEmail(mockRequest, 'link-999', { email: 'destinatario@empresa.com' })
    ).rejects.toThrow(ProblemException);
  });

  it('throws 503 OUTBOX_UNAVAILABLE if outbox service is not configured', async () => {
    const unconfiguredController = new CheckoutLinkController(mockLinksService, mockAuthService);

    await expect(
      unconfiguredController.sendEmail(mockRequest, 'link-100', {
        email: 'destinatario@empresa.com'
      })
    ).rejects.toThrow(ProblemException);
  });
});
