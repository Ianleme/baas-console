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

import { CheckoutLinkEntity } from '../../checkout-links/entities/checkout-link.entity.js';

export type PaymentMethod = 'PIX' | 'CARD';
export type PaymentAttemptStatus =
  | 'PROCESSING'
  | 'PENDING'
  | 'RECONCILIATION_PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'EXPIRED'
  | 'MANUAL_REVIEW';

@Entity({ name: 'payment_attempts' })
@Index('uq_payment_attempts_external_reference', ['merchantId', 'externalReference'], {
  unique: true
})
@Index('uq_payment_attempts_gateway_payment', ['merchantId', 'gatewayPaymentId'], { unique: true })
@Index('uq_payment_attempts_gateway_transaction', ['merchantId', 'gatewayTransactionId'], {
  unique: true
})
@Index('uq_payment_attempts_id_merchant', ['id', 'merchantId'], { unique: true })
@Index('uq_payment_attempts_unresolved_link', ['merchantId', 'unresolvedCheckoutLinkId'], {
  unique: true
})
@Index('idx_payment_attempts_checkout_tenant', ['checkoutLinkId', 'merchantId'])
@Check('chk_payment_attempts_fee_bps', 'fee_bps BETWEEN 0 AND 10000')
@Check(
  'chk_payment_attempts_amounts',
  'gross_amount_cents > 0 AND gross_amount_cents = fee_amount_cents + net_amount_cents'
)
@Check(
  'chk_payment_attempts_installments',
  "(method = 'PIX' AND installments = 1) OR (method = 'CARD' AND installments BETWEEN 1 AND 21)"
)
@Check('chk_payment_attempts_card_last4', "card_last4 IS NULL OR card_last4 REGEXP '^[0-9]{4}$'")
export class PaymentAttemptEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @Column({ name: 'checkout_link_id', type: 'char', length: 36 })
  checkoutLinkId!: string;

  @ManyToOne(() => CheckoutLinkEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'checkout_link_id', referencedColumnName: 'id' },
    { name: 'merchant_id', referencedColumnName: 'merchantId' }
  ])
  checkoutLink!: CheckoutLinkEntity;

  @Column({ type: 'enum', enum: ['PIX', 'CARD'] })
  method!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: [
      'PROCESSING',
      'PENDING',
      'RECONCILIATION_PENDING',
      'APPROVED',
      'DENIED',
      'EXPIRED',
      'MANUAL_REVIEW'
    ]
  })
  status!: PaymentAttemptStatus;

  @Column({
    name: 'unresolved_checkout_link_id',
    type: 'char',
    length: 36,
    nullable: true,
    insert: false,
    update: false,
    asExpression:
      "CASE WHEN status IN ('PROCESSING', 'PENDING', 'RECONCILIATION_PENDING', 'MANUAL_REVIEW') THEN checkout_link_id ELSE NULL END",
    generatedType: 'STORED'
  })
  unresolvedCheckoutLinkId!: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 100 })
  externalReference!: string;

  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 191, nullable: true })
  gatewayPaymentId!: string | null;

  @Column({ name: 'gateway_tx_id', type: 'varchar', length: 191, nullable: true })
  gatewayTransactionId!: string | null;

  @Column({ type: 'tinyint', unsigned: true })
  installments!: number;

  @Column({ name: 'fee_bps', type: 'smallint', unsigned: true })
  feeBps!: number;

  @Column({ name: 'gross_amount_cents', type: 'bigint', unsigned: true })
  grossAmountCents!: string;

  @Column({ name: 'fee_amount_cents', type: 'bigint', unsigned: true })
  feeAmountCents!: string;

  @Column({ name: 'net_amount_cents', type: 'bigint', unsigned: true })
  netAmountCents!: string;

  @Column({ name: 'card_brand', type: 'varchar', length: 32, nullable: true })
  cardBrand!: string | null;

  @Column({ name: 'card_last4', type: 'char', length: 4, nullable: true })
  cardLast4!: string | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null;

  @Column({ name: 'pix_txid', type: 'varchar', length: 191, nullable: true })
  pixTxid!: string | null;

  @Column({ name: 'pix_emv', type: 'text', nullable: true })
  pixEmv!: string | null;

  @Column({ name: 'pix_qr_code_base64', type: 'mediumtext', nullable: true })
  pixQrCodeBase64!: string | null;

  @Column({ name: 'reconciliation_attempts', type: 'smallint', unsigned: true, default: 0 })
  reconciliationAttempts!: number;

  @Column({ name: 'next_reconciliation_at', type: 'datetime', precision: 6, nullable: true })
  nextReconciliationAt!: Date | null;

  @Column({ name: 'lease_until', type: 'datetime', precision: 6, nullable: true })
  leaseUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
