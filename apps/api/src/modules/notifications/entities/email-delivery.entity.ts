import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';

import { MerchantEntity } from '../../auth/entities/merchant.entity.js';

export type EmailDeliveryStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';

@Entity({ name: 'email_deliveries' })
@Index('uq_email_deliveries_idempotency', ['merchantId', 'idempotencyKey'], { unique: true })
@Index('idx_email_deliveries_lease', ['status', 'nextAttemptAt', 'leaseUntil'])
@Index('idx_email_deliveries_purge', ['purgeAfter'])
export class EmailDeliveryEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ type: 'varchar', length: 64 })
  kind!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 191 })
  idempotencyKey!: string;

  @Column({ name: 'recipient_ciphertext', type: 'varbinary', length: 4096, nullable: true })
  recipientCiphertext!: Buffer | null;

  @Column({ name: 'recipient_masked', type: 'varchar', length: 191 })
  recipientMasked!: string;

  @Column({ name: 'template_version', type: 'smallint', unsigned: true })
  templateVersion!: number;

  @Column({ name: 'payload_ciphertext', type: 'longblob', nullable: true })
  payloadCiphertext!: Buffer | null;

  @Column({ type: 'enum', enum: ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'DEAD_LETTER'] })
  status!: EmailDeliveryStatus;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  attempts!: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', precision: 6, nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'lease_until', type: 'datetime', precision: 6, nullable: true })
  leaseUntil!: Date | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 191, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, nullable: true })
  lastErrorCode!: string | null;

  @Column({ name: 'purge_after', type: 'datetime', precision: 6 })
  purgeAfter!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
