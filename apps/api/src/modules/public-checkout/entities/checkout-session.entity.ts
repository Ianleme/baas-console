import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn
} from 'typeorm';

import { CheckoutLinkEntity } from '../../checkout-links/entities/checkout-link.entity.js';

@Entity({ name: 'checkout_sessions' })
@Index('uq_checkout_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('idx_checkout_sessions_link', ['checkoutLinkId'])
export class CheckoutSessionEntity {
  @PrimaryColumn({ type: 'char', length: 36 }) id!: string;
  @Column({ name: 'checkout_link_id', type: 'char', length: 36 }) checkoutLinkId!: string;
  @ManyToOne(() => CheckoutLinkEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'checkout_link_id' })
  checkoutLink!: CheckoutLinkEntity;
  @Column({ name: 'token_hash', type: 'varbinary', length: 32 }) tokenHash!: Buffer;
  @Column({ name: 'csrf_token_hash', type: 'varbinary', length: 32 }) csrfTokenHash!: Buffer;
  @Column({ name: 'expires_at', type: 'datetime', precision: 6 }) expiresAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 }) createdAt!: Date;
}
