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

import { UserEntity } from './user.entity.js';

@Entity({ name: 'auth_sessions' })
@Index('uq_auth_sessions_refresh_token_hash', ['refreshTokenHash'], { unique: true })
@Index('idx_auth_sessions_family_id', ['familyId'])
@Index('idx_auth_sessions_expires_at', ['expiresAt'])
export class AuthSessionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'user_id', referencedColumnName: 'id' },
    { name: 'merchant_id', referencedColumnName: 'merchantId' }
  ])
  user!: UserEntity;

  @Column({ name: 'family_id', type: 'char', length: 36 })
  familyId!: string;

  @Column({ name: 'refresh_token_hash', type: 'varbinary', length: 64 })
  refreshTokenHash!: Buffer;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'rotated_at', type: 'datetime', precision: 6, nullable: true })
  rotatedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', precision: 6, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'reuse_detected_at', type: 'datetime', precision: 6, nullable: true })
  reuseDetectedAt!: Date | null;

  @Column({ name: 'user_agent_hash', type: 'varbinary', length: 64, nullable: true })
  userAgentHash!: Buffer | null;

  @Column({ name: 'ip_address_hash', type: 'varbinary', length: 64, nullable: true })
  ipAddressHash!: Buffer | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
