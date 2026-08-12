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
import { UserEntity } from '../../auth/entities/user.entity.js';

@Entity({ name: 'audit_events' })
@Index('idx_audit_events_merchant_created', ['merchantId', 'createdAt'])
@Index('idx_audit_events_actor_tenant', ['actorUserId', 'merchantId'])
export class AuditEventEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'actor_user_id', referencedColumnName: 'id' },
    { name: 'merchant_id', referencedColumnName: 'merchantId' }
  ])
  actorUser!: UserEntity | null;

  @Column({ name: 'actor_type', type: 'enum', enum: ['USER', 'SYSTEM', 'DEMO'] })
  actorType!: 'USER' | 'SYSTEM' | 'DEMO';

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 64 })
  targetType!: string;

  @Column({ name: 'target_public_id', type: 'varchar', length: 191, nullable: true })
  targetPublicId!: string | null;

  @Column({ name: 'request_id', type: 'char', length: 36 })
  requestId!: string;

  @Column({ name: 'metadata_json', type: 'json' })
  metadataJson!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
