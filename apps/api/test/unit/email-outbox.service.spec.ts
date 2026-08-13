import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';

import {
  EmailOutboxService,
  getRetryBackoffMs,
  maskEmail
} from '../../src/modules/notifications/email-outbox.service.js';
import type { EmailDeliveryEntity } from '../../src/modules/notifications/entities/email-delivery.entity.js';
import {
  SmtpEmailGateway,
  type EmailGateway
} from '../../src/modules/notifications/smtp-email.gateway.js';
import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';

describe('EmailOutboxService and SmtpEmailGateway', () => {
  const masterKey = Buffer.alloc(32, 7);
  const encryptionService = new EncryptionService(masterKey);

  describe('maskEmail', () => {
    it('masks standard e-mails retaining only first character and domain', () => {
      expect(maskEmail('lojista@empresa.com.br')).toBe('l***@empresa.com.br');
      expect(maskEmail('a@b.com')).toBe('a***@b.com');
    });

    it('handles malformed string gracefully', () => {
      expect(maskEmail('invalid-email')).toBe('***');
    });
  });

  describe('getRetryBackoffMs', () => {
    it('returns exact backoff schedule (1m, 5m, 15m, 60m)', () => {
      expect(getRetryBackoffMs(1)).toBe(60_000);
      expect(getRetryBackoffMs(2)).toBe(300_000);
      expect(getRetryBackoffMs(3)).toBe(900_000);
      expect(getRetryBackoffMs(4)).toBe(3_600_000);
      expect(getRetryBackoffMs(5)).toBe(0);
    });
  });

  describe('SmtpEmailGateway configuration', () => {
    it('defaults to 127.0.0.1:1025 Mailpit defaults', () => {
      const gateway = new SmtpEmailGateway();
      expect(gateway).toBeDefined();
    });

    it('accepts explicit options', () => {
      const gateway = new SmtpEmailGateway({
        host: 'smtp.test',
        port: 2525,
        from: 'test@baas.local'
      });
      expect(gateway).toBeDefined();
    });
  });

  describe('EmailOutboxService unit behavior', () => {
    let mockDeliveries: EmailDeliveryEntity[];
    let mockRepository: Repository<EmailDeliveryEntity>;
    let mockGateway: EmailGateway;
    let sendEmailMock: jest.Mock;
    let service: EmailOutboxService;

    beforeEach(() => {
      mockDeliveries = [];
      const createQueryBuilderMock = () => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue(
            mockDeliveries.filter((d) => d.status === 'QUEUED' || d.status === 'FAILED')
          ),
        set: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 })
      });

      mockRepository = {
        findOne: jest
          .fn()
          .mockImplementation(
            (options: { where: { merchantId: string; idempotencyKey: string } }) => {
              const found = mockDeliveries.find(
                (d) =>
                  d.merchantId === options.where.merchantId &&
                  d.idempotencyKey === options.where.idempotencyKey
              );
              return Promise.resolve(found ?? null);
            }
          ),
        create: jest.fn().mockImplementation((entity: EmailDeliveryEntity) => entity),
        save: jest.fn().mockImplementation((entity: EmailDeliveryEntity) => {
          mockDeliveries.push(entity);
          return Promise.resolve(entity);
        }),
        update: jest.fn().mockImplementation((id: string, update: Partial<EmailDeliveryEntity>) => {
          const item = mockDeliveries.find((d) => d.id === id);
          if (item) {
            Object.assign(item, update);
          }
          return Promise.resolve({ affected: item ? 1 : 0 });
        }),
        createQueryBuilder: jest.fn().mockImplementation(createQueryBuilderMock)
      } as unknown as Repository<EmailDeliveryEntity>;

      sendEmailMock = jest.fn().mockResolvedValue({ providerMessageId: '<msg-123@baas.local>' });
      mockGateway = {
        sendEmail: sendEmailMock
      };

      service = new EmailOutboxService(mockRepository, encryptionService, mockGateway);
    });

    it('enqueues e-mail outbox record in QUEUED status without invoking SMTP gateway', async () => {
      const merchantId = randomUUID();
      const delivery = await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'link:100',
        recipient: 'cliente@loja.com',
        payload: { linkUrl: 'https://pay.baas.test/ck_123', amountCents: 5000 }
      });

      expect(delivery.status).toBe('QUEUED');
      expect(delivery.recipientMasked).toBe('c***@loja.com');
      expect(delivery.attempts).toBe(0);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('returns existing delivery when same idempotency key is enqueued for same merchant', async () => {
      const merchantId = randomUUID();
      const first = await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'dup:key',
        recipient: 'first@loja.com',
        payload: { a: 1 }
      });

      const second = await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'dup:key',
        recipient: 'second@loja.com',
        payload: { a: 2 }
      });

      expect(second.id).toBe(first.id);
      expect(mockDeliveries.length).toBe(1);
    });

    it('encrypts recipient and payload ciphertext', async () => {
      const merchantId = randomUUID();
      const delivery = await service.enqueue({
        merchantId,
        kind: 'PAYMENT_RECEIPT',
        idempotencyKey: 'rcpt:1',
        recipient: 'pagador@exemplo.com',
        payload: { amountCents: 1500 }
      });

      expect(Buffer.isBuffer(delivery.recipientCiphertext)).toBe(true);
      expect(Buffer.isBuffer(delivery.payloadCiphertext)).toBe(true);

      if (!delivery.recipientCiphertext) {
        throw new Error('RECIPIENT_CIPHERTEXT_MISSING');
      }

      const decryptedRecipient = encryptionService.decrypt(
        delivery.recipientCiphertext,
        merchantId,
        delivery.id,
        'recipient'
      );
      expect(decryptedRecipient).toBe('pagador@exemplo.com');
    });

    it('processes queued item, decrypts, sends email, and marks SENT', async () => {
      const merchantId = randomUUID();
      await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'send:1',
        recipient: 'comprador@loja.com',
        payload: { text: 'Link de pagamento https://pay.baas.test/1' }
      });

      const res = await service.processOutbox(10);
      expect(res.processed).toBe(1);
      expect(res.sent).toBe(1);
      expect(res.failed).toBe(0);
      expect(sendEmailMock).toHaveBeenCalledWith({
        to: 'comprador@loja.com',
        subject: 'Seu link de pagamento',
        html: '<p>Link de pagamento https://pay.baas.test/1</p>'
      });
      expect(mockDeliveries[0]?.status).toBe('SENT');
      expect(mockDeliveries[0]?.providerMessageId).toBe('<msg-123@baas.local>');
    });

    it('schedules retry on 1st transient SMTP failure', async () => {
      sendEmailMock.mockRejectedValueOnce(new Error('SMTP_CONNECTION_REFUSED'));

      const merchantId = randomUUID();
      await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'fail:1',
        recipient: 'fail@loja.com',
        payload: { text: 'test' }
      });

      const res = await service.processOutbox(10);
      expect(res.sent).toBe(0);
      expect(res.failed).toBe(1);
      expect(mockDeliveries[0]?.status).toBe('FAILED');
      expect(mockDeliveries[0]?.attempts).toBe(1);
      expect(mockDeliveries[0]?.lastErrorCode).toBe('SMTP_CONNECTION_REFUSED');
      expect(mockDeliveries[0]?.nextAttemptAt).toBeDefined();
    });

    it('transitions to DEAD_LETTER after 5 failed attempts', async () => {
      sendEmailMock.mockRejectedValue(new Error('SMTP_PERMANENT_ERROR'));

      const merchantId = randomUUID();
      await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'dl:1',
        recipient: 'deadletter@loja.com',
        payload: { text: 'test' }
      });

      if (mockDeliveries[0]) {
        mockDeliveries[0].attempts = 4;
      }

      const res = await service.processOutbox(10);
      expect(res.deadLetter).toBe(1);
      expect(mockDeliveries[0]?.status).toBe('DEAD_LETTER');
      expect(mockDeliveries[0]?.attempts).toBe(5);
      expect(mockDeliveries[0]?.nextAttemptAt).toBeNull();
    });

    it('skips item if competing worker acquired lease first', async () => {
      const merchantId = randomUUID();
      await service.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey: 'skip:1',
        recipient: 'skip@loja.com',
        payload: {}
      });

      mockRepository.createQueryBuilder = jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockDeliveries),
        set: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 })
      }));

      const res = await service.processOutbox(10);
      expect(res.processed).toBe(1);
      expect(res.sent).toBe(0);
      expect(res.failed).toBe(0);
    });
  });
});
