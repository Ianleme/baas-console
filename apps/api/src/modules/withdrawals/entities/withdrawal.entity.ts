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

export type WithdrawalStatus =
  | 'PROCESSING'
  | 'PENDING'
  | 'RECONCILIATION_PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'MANUAL_REVIEW';

@Entity({ name: 'withdrawals' })
@Index('uq_withdrawals_external_reference', ['merchantId', 'externalReference'], { unique: true })
@Index('uq_withdrawals_gateway_id', ['merchantId', 'gatewayWithdrawalId'], { unique: true })
@Index('uq_withdrawals_id_merchant', ['id', 'merchantId'], { unique: true })
@Index('idx_withdrawals_reconciliation', ['status', 'nextReconciliationAt', 'leaseUntil'])
@Check('chk_withdrawals_amount_positive', 'amount_cents > 0')
export class WithdrawalEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ name: 'external_reference', type: 'varchar', length: 100 })
  externalReference!: string;

  @Column({ name: 'amount_cents', type: 'bigint', unsigned: true })
  amountCents!: string;

  @Column({
    type: 'enum',
    enum: ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'APPROVED', 'DENIED', 'MANUAL_REVIEW']
  })
  status!: WithdrawalStatus;

  @Column({ name: 'gateway_withdrawal_id', type: 'varchar', length: 191, nullable: true })
  gatewayWithdrawalId!: string | null;

  @Column({ name: 'destination_type', type: 'varchar', length: 32 })
  destinationType!: string;

  @Column({ name: 'destination_masked', type: 'varchar', length: 191 })
  destinationMasked!: string;

  @Column({ name: 'destination_blind_index', type: 'varbinary', length: 64, nullable: true })
  destinationBlindIndex!: Buffer | null;

  @Column({ name: 'reconciliation_attempts', type: 'smallint', unsigned: true, default: 0 })
  reconciliationAttempts!: number;

  @Column({ name: 'next_reconciliation_at', type: 'datetime', precision: 6, nullable: true })
  nextReconciliationAt!: Date | null;

  @Column({ name: 'lease_until', type: 'datetime', precision: 6, nullable: true })
  leaseUntil!: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, nullable: true })
  lastErrorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
