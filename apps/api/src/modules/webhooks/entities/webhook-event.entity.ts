import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn
} from 'typeorm';

import { WebhookEndpointEntity } from './webhook-endpoint.entity.js';

export type WebhookProcessingStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'RETRY_SCHEDULED'
  | 'PROCESSED'
  | 'UNPROCESSABLE'
  | 'DEAD_LETTER';

@Entity({ name: 'webhook_events' })
@Index('uq_webhook_events_dedupe', ['webhookEndpointId', 'dedupeKey'], { unique: true })
@Index('idx_webhook_events_endpoint_tenant', ['webhookEndpointId', 'merchantId'])
@Index('idx_webhook_events_lease', ['status', 'nextAttemptAt', 'leaseUntil'])
@Index('idx_webhook_events_purge', ['purgeAfter'])
export class WebhookEventEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @Column({ name: 'webhook_endpoint_id', type: 'char', length: 36 })
  webhookEndpointId!: string;

  @ManyToOne(() => WebhookEndpointEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'webhook_endpoint_id', referencedColumnName: 'id' },
    { name: 'merchant_id', referencedColumnName: 'merchantId' }
  ])
  webhookEndpoint!: WebhookEndpointEntity;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 191 })
  dedupeKey!: string;

  @Column({ name: 'raw_body_ciphertext', type: 'longblob' })
  rawBodyCiphertext!: Buffer;

  @Column({ name: 'raw_body_hash', type: 'varbinary', length: 64 })
  rawBodyHash!: Buffer;

  @Column({ name: 'signature_metadata', type: 'json' })
  signatureMetadata!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ['RECEIVED', 'PROCESSING', 'RETRY_SCHEDULED', 'PROCESSED', 'UNPROCESSABLE', 'DEAD_LETTER']
  })
  status!: WebhookProcessingStatus;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  attempts!: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', precision: 6, nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'lease_until', type: 'datetime', precision: 6, nullable: true })
  leaseUntil!: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, nullable: true })
  lastErrorCode!: string | null;

  @Column({
    name: 'received_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)'
  })
  receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'datetime', precision: 6, nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'purge_after', type: 'datetime', precision: 6 })
  purgeAfter!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
