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

export type GatewayAccountStatus = 'AWAITING_CREDENTIALS' | 'ACTIVE' | 'ERROR' | 'DISCONNECTED';

@Entity({ name: 'gateway_accounts' })
@Index('uq_gateway_accounts_merchant', ['merchantId'], { unique: true })
export class GatewayAccountEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({
    type: 'enum',
    enum: ['AWAITING_CREDENTIALS', 'ACTIVE', 'ERROR', 'DISCONNECTED'],
    default: 'AWAITING_CREDENTIALS'
  })
  status!: GatewayAccountStatus;

  @Column({ name: 'gateway_user_id', type: 'varchar', length: 191, nullable: true })
  gatewayUserId!: string | null;

  @Column({ name: 'codigo_cliente_ciphertext', type: 'varbinary', length: 4096, nullable: true })
  codigoClienteCiphertext!: Buffer | null;

  @Column({ name: 'chave_loja_ciphertext', type: 'varbinary', length: 4096, nullable: true })
  chaveLojaCiphertext!: Buffer | null;

  @Column({ name: 'access_token_ciphertext', type: 'varbinary', length: 4096, nullable: true })
  accessTokenCiphertext!: Buffer | null;

  @Column({ name: 'token_expires_at', type: 'datetime', precision: 6, nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({ name: 'last_connected_at', type: 'datetime', precision: 6, nullable: true })
  lastConnectedAt!: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, nullable: true })
  lastErrorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
