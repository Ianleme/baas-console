import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn
} from 'typeorm';

import { MerchantEntity } from '../../auth/entities/merchant.entity.js';

@Entity({ name: 'wallet_snapshots' })
@Index('idx_wallet_snapshots_merchant_captured', ['merchantId', 'capturedAt'])
export class WalletSnapshotEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ name: 'balance_cents', type: 'bigint', unsigned: true })
  balanceCents!: string;

  @Column({ name: 'available_cents', type: 'bigint', unsigned: true, nullable: true })
  availableCents!: string | null;

  @Column({ name: 'captured_at', type: 'datetime', precision: 6 })
  capturedAt!: Date;

  @Column({ name: 'source_request_id', type: 'varchar', length: 191, nullable: true })
  sourceRequestId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
