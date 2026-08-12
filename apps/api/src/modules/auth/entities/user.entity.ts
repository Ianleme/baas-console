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

import { MerchantEntity } from './merchant.entity.js';

export type UserStatus = 'ACTIVE' | 'DISABLED';

@Entity({ name: 'users' })
@Index('uq_users_email_normalized', ['emailNormalized'], { unique: true })
@Index('uq_users_owner_merchant', ['merchantId'], { unique: true })
@Index('uq_users_id_merchant', ['id', 'merchantId'], { unique: true })
export class UserEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ name: 'email_normalized', type: 'varchar', length: 254 })
  emailNormalized!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'enum', enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'datetime', precision: 6, nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
