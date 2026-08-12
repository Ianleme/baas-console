import {
  Check,
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

export type TransactionOriginType = 'PAYMENT' | 'WITHDRAWAL';
export type TransactionType = 'CREDIT' | 'DEBIT';
export type TransactionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'RECONCILIATION_PENDING'
  | 'REVERSED';

@Entity({ name: 'transactions' })
@Index('uq_transactions_origin', ['merchantId', 'originType', 'originId'], { unique: true })
@Index('uq_transactions_external_reference', ['merchantId', 'externalReference'], { unique: true })
@Index('uq_transactions_gateway_id', ['merchantId', 'gatewayTransactionId'], { unique: true })
@Check(
  'chk_transactions_amounts',
  'gross_amount_cents > 0 AND gross_amount_cents = fee_amount_cents + net_amount_cents'
)
export class TransactionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ name: 'origin_type', type: 'enum', enum: ['PAYMENT', 'WITHDRAWAL'] })
  originType!: TransactionOriginType;

  @Column({ name: 'origin_id', type: 'char', length: 36 })
  originId!: string;

  @Column({ name: 'external_reference', type: 'varchar', length: 100 })
  externalReference!: string;

  @Column({ name: 'gateway_transaction_id', type: 'varchar', length: 191, nullable: true })
  gatewayTransactionId!: string | null;

  @Column({ type: 'enum', enum: ['CREDIT', 'DEBIT'] })
  type!: TransactionType;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'APPROVED', 'DENIED', 'RECONCILIATION_PENDING', 'REVERSED']
  })
  status!: TransactionStatus;

  @Column({ name: 'gross_amount_cents', type: 'bigint', unsigned: true })
  grossAmountCents!: string;

  @Column({ name: 'fee_amount_cents', type: 'bigint', unsigned: true })
  feeAmountCents!: string;

  @Column({ name: 'net_amount_cents', type: 'bigint', unsigned: true })
  netAmountCents!: string;

  @Column({ name: 'occurred_at', type: 'datetime', precision: 6 })
  occurredAt!: Date;

  @Column({ name: 'projection_version', type: 'int', unsigned: true })
  projectionVersion!: number;

  @Column({ name: 'receipt_token_hash', type: 'varbinary', length: 64, nullable: true })
  receiptTokenHash!: Buffer | null;

  @Column({ name: 'receipt_token_ciphertext', type: 'varbinary', length: 4096, nullable: true })
  receiptTokenCiphertext!: Buffer | null;

  @Column({ name: 'receipt_token_expires_at', type: 'datetime', precision: 6, nullable: true })
  receiptTokenExpiresAt!: Date | null;

  @Column({ name: 'receipt_token_revoked_at', type: 'datetime', precision: 6, nullable: true })
  receiptTokenRevokedAt!: Date | null;

  @Column({ name: 'receipt_token_version', type: 'int', unsigned: true, default: 0 })
  receiptTokenVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
