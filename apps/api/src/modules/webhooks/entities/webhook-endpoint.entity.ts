import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { MerchantEntity } from '../../auth/entities/merchant.entity.js';

export type WebhookEventType = 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL';

@Entity({ name: 'webhook_endpoints' })
@Index('uq_webhook_endpoints_merchant_event', ['merchantId', 'eventType'], { unique: true })
@Index('uq_webhook_endpoints_public_id', ['publicEndpointId'], { unique: true })
@Index('uq_webhook_endpoints_gateway_id', ['merchantId', 'gatewayWebhookId'], { unique: true })
@Index('uq_webhook_endpoints_id_merchant', ['id', 'merchantId'], { unique: true })
export class WebhookEndpointEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'char', length: 36 })
  merchantId!: string;

  @ManyToOne(() => MerchantEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;

  @Column({ name: 'public_endpoint_id', type: 'char', length: 32 })
  publicEndpointId!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: ['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL']
  })
  eventType!: WebhookEventType;

  @Column({ name: 'gateway_webhook_id', type: 'varchar', length: 191, nullable: true })
  gatewayWebhookId!: string | null;

  @Column({ name: 'secret_ciphertext', type: 'varbinary', length: 4096 })
  secretCiphertext!: Buffer;

  @Column({ type: 'enum', enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'DISABLED';

  @Column({ name: 'configured_at', type: 'datetime', precision: 6 })
  configuredAt!: Date;

  @Column({ name: 'last_received_at', type: 'datetime', precision: 6, nullable: true })
  lastReceivedAt!: Date | null;
}
