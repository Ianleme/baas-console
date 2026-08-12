import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn
} from 'typeorm';

import { PaymentAttemptEntity } from '../../payments/entities/payment-attempt.entity.js';

@Entity({ name: 'financial_events' })
@Index('idx_financial_events_merchant_occurred', ['merchantId', 'occurredAt'])
@Index('idx_financial_events_payment_tenant', ['paymentAttemptId', 'merchantId'])
@Check(
  'chk_financial_events_exactly_one_origin',
  '(payment_attempt_id IS NULL) <> (withdrawal_id IS NULL)'
)
export class FinancialEventEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @Column({ name: 'payment_attempt_id', type: 'char', length: 36, nullable: true })
  paymentAttemptId!: string | null;

  @ManyToOne(() => PaymentAttemptEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'payment_attempt_id', referencedColumnName: 'id' },
    { name: 'merchant_id', referencedColumnName: 'merchantId' }
  ])
  paymentAttempt!: PaymentAttemptEntity | null;

  @Column({ name: 'withdrawal_id', type: 'char', length: 36, nullable: true })
  withdrawalId!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'previous_status', type: 'varchar', length: 64, nullable: true })
  previousStatus!: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 64 })
  newStatus!: string;

  @Column({ type: 'enum', enum: ['GATEWAY', 'WEBHOOK', 'RECONCILIATION', 'SYSTEM'] })
  source!: 'GATEWAY' | 'WEBHOOK' | 'RECONCILIATION' | 'SYSTEM';

  @Column({ name: 'occurred_at', type: 'datetime', precision: 6 })
  occurredAt!: Date;

  @Column({ name: 'metadata_json', type: 'json' })
  metadataJson!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
