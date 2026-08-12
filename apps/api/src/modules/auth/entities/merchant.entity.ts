import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type MerchantStatus = 'ACTIVE' | 'SUSPENDED';

@Entity({ name: 'merchants' })
export class MerchantEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 255 })
  legalName!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ type: 'enum', enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' })
  status!: MerchantStatus;

  @Column({ name: 'demo_mode', type: 'boolean', default: false })
  demoMode!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
