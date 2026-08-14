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
      list: jest.fn().mockResolvedValue({
        items: [mockLink],
        total: 1,
        summary: { totalCount: 1, activeCount: 1, paidCount: 0, paidAmountCents: '0' }
      }),
      detail: jest.fn().mockImplementation((merchantId: string, id: string) => {
        if (merchantId === 'merchant-1' && id === 'link-100') {
          return Promise.resolve(mockLink);
        }
        const err = new Error('LINK_NOT_FOUND') as Error & { code: string };
        err.code = 'LINK_NOT_FOUND';
        return Promise.reject(err);
      }),
      share: jest.fn().mockImplementation((merchantId: string, id: string) => {
        if (merchantId === 'merchant-1' && id === 'link-100') {
          return Promise.resolve({ link: mockLink, publicToken: 'recovered-public-token' });
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

    controller = new CheckoutLinkController(
      mockLinksService,
      mockAuthService,
      mockOutboxService,
      'https://checkout.example.com'
    );
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
        idempotencyKey: expect.stringMatching(
          /^checkout-email:link-100:destinatario@empresa\.com:[a-f0-9]{16}$/u
        ),
        recipient: 'destinatario@empresa.com'
      })
    );
    const queued = enqueueMock.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      payload: { checkoutUrl: string; text: string; html: string };
    };
    expect(queued.idempotencyKey).not.toContain('recovered-public-token');
    expect(queued.payload.checkoutUrl).toBe(
      'https://checkout.example.com/pay.html#/checkout/recovered-public-token'
    );
    expect(queued.payload.text).toContain(queued.payload.checkoutUrl);
    expect(queued.payload.html).toContain(`href="${queued.payload.checkoutUrl}"`);
    expect(mockLinksService.share).toHaveBeenCalledWith('merchant-1', 'link-100');
  });

  it('never exposes the public token in the authenticated list response', async () => {
    const result = await controller.list(mockRequest, { limit: 10, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('publicToken');
    expect(result.items[0]).not.toHaveProperty('publicTokenCiphertext');
  });

  it('returns no token from detail and issues it only from tenant-scoped share', async () => {
    await expect(controller.detail(mockRequest, 'link-100')).resolves.not.toHaveProperty(
      'publicToken'
    );
    await expect(controller.share(mockRequest, 'link-100')).resolves.toMatchObject({
      publicToken: 'recovered-public-token'
    });
    expect(mockLinksService.share).toHaveBeenCalledWith('merchant-1', 'link-100');
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

  it('rejects an insecure non-local public checkout origin', async () => {
    const insecureController = new CheckoutLinkController(
      mockLinksService,
      mockAuthService,
      mockOutboxService,
      'http://checkout.example.com'
    );

    await expect(
      insecureController.sendEmail(mockRequest, 'link-100', {
        email: 'destinatario@empresa.com'
      })
    ).rejects.toThrow(ProblemException);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
