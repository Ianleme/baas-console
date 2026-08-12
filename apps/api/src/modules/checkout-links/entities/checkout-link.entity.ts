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

export type AllowedPaymentMethods = 'PIX' | 'CARD' | 'PIX_CARD';
export type CheckoutLinkStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAID';

@Entity({ name: 'checkout_links' })
@Index('uq_checkout_links_reference', ['merchantId', 'publicReference'], { unique: true })
@Index('uq_checkout_links_public_token_hash', ['publicTokenHash'], { unique: true })
@Index('uq_checkout_links_id_merchant', ['id', 'merchantId'], { unique: true })
@Check('chk_checkout_links_amount_positive', 'amount_cents > 0')
@Check(
  'chk_checkout_links_installments',
  "(allowed_methods = 'PIX' AND max_installments = 1) OR (allowed_methods <> 'PIX' AND max_installments BETWEEN 1 AND 12)"
)
export class CheckoutLinkEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ name: 'public_reference', type: 'varchar', length: 100 })
  publicReference!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ name: 'amount_cents', type: 'bigint', unsigned: true })
  amountCents!: string;

  @Column({ name: 'allowed_methods', type: 'enum', enum: ['PIX', 'CARD', 'PIX_CARD'] })
  allowedMethods!: AllowedPaymentMethods;

  @Column({ name: 'max_installments', type: 'tinyint', unsigned: true, default: 1 })
  maxInstallments!: number;

  @Column({ name: 'fee_snapshot_json', type: 'json', nullable: true })
  feeSnapshotJson!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: ['ACTIVE', 'CANCELLED', 'EXPIRED', 'PAID'], default: 'ACTIVE' })
  status!: CheckoutLinkStatus;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'public_token_hash', type: 'varbinary', length: 64 })
  publicTokenHash!: Buffer;

  @Column({ name: 'public_token_ciphertext', type: 'varbinary', length: 4096 })
  publicTokenCiphertext!: Buffer;

  @Column({ name: 'token_closed_at', type: 'datetime', precision: 6, nullable: true })
  tokenClosedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
