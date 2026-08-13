import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';

import { EncryptionService } from '../gateway-accounts/encryption.service.js';
import { EmailDeliveryEntity } from './entities/email-delivery.entity.js';
import type { EmailGateway } from './brevo-email.gateway.js';
import { EMAIL_GATEWAY } from './email-gateway.token.js';

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0] ?? '';
  const domain = parts[1] ?? '';
  const firstChar = name[0] ?? '';
  return `${firstChar}***@${domain}`;
}

export function getRetryBackoffMs(attemptNumber: number): number {
  switch (attemptNumber) {
    case 1:
      return 60_000;
    case 2:
      return 300_000;
    case 3:
      return 900_000;
    case 4:
      return 3_600_000;
    default:
      return 0;
  }
}

export interface EnqueueEmailInput {
  merchantId: string;
  kind: string;
  idempotencyKey: string;
  recipient: string;
  templateVersion?: number;
  payload: Record<string, unknown>;
}

export interface EmailDeliveryView {
  id: string;
  kind: string;
  idempotencyKey: string;
  recipientMasked: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
}

@Injectable()
export class EmailOutboxService {
  private readonly logger = new Logger(EmailOutboxService.name);

  constructor(
    private readonly repositoryOrDb:
      | Repository<EmailDeliveryEntity>
      | { getDataSource(): { getRepository(entity: unknown): Repository<EmailDeliveryEntity> } }
      | (() => Repository<EmailDeliveryEntity>),
    private readonly encryptionService: EncryptionService,
    @Inject(EMAIL_GATEWAY)
    private readonly gateway: EmailGateway
  ) {}

  private get repository(): Repository<EmailDeliveryEntity> {
    if (typeof this.repositoryOrDb === 'function') {
      return this.repositoryOrDb();
    }
    if ('getDataSource' in this.repositoryOrDb) {
      return this.repositoryOrDb.getDataSource().getRepository(EmailDeliveryEntity);
    }
    return this.repositoryOrDb;
  }

  async enqueue(input: EnqueueEmailInput): Promise<EmailDeliveryEntity> {
    const existing = await this.repository.findOne({
      where: { merchantId: input.merchantId, idempotencyKey: input.idempotencyKey }
    });
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const recipientCiphertext = this.encryptionService.encrypt(
      input.recipient,
      input.merchantId,
      id,
      'recipient'
    );
    const payloadCiphertext = this.encryptionService.encrypt(
      JSON.stringify(input.payload),
      input.merchantId,
      id,
      'payload'
    );
    const masked = maskEmail(input.recipient);
    const purgeAfter = new Date(Date.now() + 30 * 86_400_000);

    const delivery = this.repository.create({
      id,
      merchantId: input.merchantId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      recipientCiphertext,
      recipientMasked: masked,
      templateVersion: input.templateVersion ?? 1,
      payloadCiphertext,
      status: 'QUEUED',
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      providerMessageId: null,
      lastErrorCode: null,
      purgeAfter
    });

    try {
      return await this.repository.save(delivery);
    } catch {
      const dupe = await this.repository.findOne({
        where: { merchantId: input.merchantId, idempotencyKey: input.idempotencyKey }
      });
      if (dupe) return dupe;
      throw new Error('FAILED_TO_ENQUEUE_EMAIL');
    }
  }

  async assertCooldown(merchantId: string, kind: string, cooldownMs: number): Promise<void> {
    const latest = await this.repository.findOne({
      where: { merchantId, kind },
      order: { createdAt: 'DESC' }
    });
    if (latest && latest.createdAt.getTime() + cooldownMs > Date.now()) {
      throw new Error('EMAIL_COOLDOWN');
    }
  }

  async listDeliveries(
    merchantId: string,
    query?: { status?: string | undefined; limit?: number | undefined; offset?: number | undefined }
  ): Promise<{ items: EmailDeliveryView[]; total: number }> {
    const qb = this.repository
      .createQueryBuilder('d')
      .where('d.merchantId = :merchantId', { merchantId });

    if (query?.status && query.status !== 'ALL') {
      qb.andWhere('d.status = :status', { status: query.status });
    }

    qb.orderBy('d.createdAt', 'DESC')
      .skip(query?.offset ?? 0)
      .take(query?.limit ?? 20);

    const [records, total] = await qb.getManyAndCount();

    const items: EmailDeliveryView[] = records.map((rec) => ({
      id: rec.id,
      kind: rec.kind,
      idempotencyKey: rec.idempotencyKey,
      recipientMasked: rec.recipientMasked,
      status: rec.status,
      attempts: rec.attempts,
      nextAttemptAt: rec.nextAttemptAt ? rec.nextAttemptAt.toISOString() : null,
      lastErrorCode: rec.lastErrorCode,
      createdAt: rec.createdAt.toISOString()
    }));

    return { items, total };
  }

  async retryDeadLetter(merchantId: string, id: string): Promise<EmailDeliveryView> {
    const item = await this.repository.findOne({ where: { merchantId, id } });
    if (!item) {
      throw new Error('DELIVERY_NOT_FOUND');
    }
    if (!['DEAD_LETTER', 'FAILED'].includes(item.status)) {
      throw new Error('DELIVERY_NOT_RETRYABLE');
    }

    item.status = 'QUEUED';
    item.attempts = 0;
    item.nextAttemptAt = new Date();
    item.leaseUntil = null;
    item.lastErrorCode = null;

    const saved = await this.repository.save(item);
    return {
      id: saved.id,
      kind: saved.kind,
      idempotencyKey: saved.idempotencyKey,
      recipientMasked: saved.recipientMasked,
      status: saved.status,
      attempts: saved.attempts,
      nextAttemptAt: saved.nextAttemptAt ? saved.nextAttemptAt.toISOString() : null,
      lastErrorCode: saved.lastErrorCode,
      createdAt: saved.createdAt.toISOString()
    };
  }

  async processOutbox(
    batchSize = 10
  ): Promise<{ processed: number; sent: number; failed: number; deadLetter: number }> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 60_000);

    const pending = await this.repository
      .createQueryBuilder('delivery')
      .where('delivery.status IN (:...statuses)', { statuses: ['QUEUED', 'FAILED'] })
      .andWhere('(delivery.nextAttemptAt IS NULL OR delivery.nextAttemptAt <= :now)', { now })
      .andWhere('(delivery.leaseUntil IS NULL OR delivery.leaseUntil < :now)', { now })
      .orderBy('delivery.createdAt', 'ASC')
      .take(batchSize)
      .getMany();

    let sent = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const item of pending) {
      const leaseAcquired = await this.repository
        .createQueryBuilder()
        .update(EmailDeliveryEntity)
        .set({ status: 'SENDING', leaseUntil })
        .where(
          'id = :id AND status IN (:...statuses) AND (leaseUntil IS NULL OR leaseUntil < :now)',
          {
            id: item.id,
            statuses: ['QUEUED', 'FAILED'],
            now
          }
        )
        .execute();

      if (leaseAcquired.affected === 0 || !item.recipientCiphertext || !item.payloadCiphertext) {
        continue;
      }

      try {
        const recipient = this.encryptionService.decrypt(
          item.recipientCiphertext,
          item.merchantId,
          item.id,
          'recipient'
        );
        const rawPayload = this.encryptionService.decrypt(
          item.payloadCiphertext,
          item.merchantId,
          item.id,
          'payload'
        );
        const payload = JSON.parse(rawPayload) as Record<string, unknown>;

        const subject =
          typeof payload.subject === 'string'
            ? payload.subject
            : item.kind === 'CHECKOUT_LINK'
              ? 'Seu link de pagamento'
              : 'Comprovante de pagamento';

        const bodyHtml =
          typeof payload.html === 'string'
            ? payload.html
            : `<p>${typeof payload.text === 'string' ? payload.text : 'Notificação BaaS Console'}</p>`;

        const sendResult = await this.gateway.sendEmail({
          to: recipient,
          subject,
          html: bodyHtml,
          ...(typeof payload.text === 'string' ? { text: payload.text } : {})
        });

        await this.repository.update(item.id, {
          status: 'SENT',
          leaseUntil: null,
          nextAttemptAt: null,
          providerMessageId: sendResult.providerMessageId,
          lastErrorCode: null
        });

        this.logger.log(
          `Email sent to ${item.recipientMasked} for kind ${item.kind} (deliveryId=${item.id})`
        );
        sent++;
      } catch (err: unknown) {
        const errObj = (err ?? {}) as { code?: string; message?: string };
        const errorCode = errObj.code ?? errObj.message ?? 'SEND_FAILED';
        const newAttempts = item.attempts + 1;

        if (newAttempts >= 5) {
          await this.repository.update(item.id, {
            status: 'DEAD_LETTER',
            attempts: newAttempts,
            nextAttemptAt: null,
            leaseUntil: null,
            lastErrorCode: errorCode.slice(0, 64)
          });
          deadLetter++;
        } else {
          const backoff = getRetryBackoffMs(newAttempts);
          const nextAttemptAt = new Date(Date.now() + backoff);
          await this.repository.update(item.id, {
            status: 'FAILED',
            attempts: newAttempts,
            nextAttemptAt,
            leaseUntil: null,
            lastErrorCode: errorCode.slice(0, 64)
          });
          failed++;
        }
      }
    }

    return { processed: pending.length, sent, failed, deadLetter };
  }
}
