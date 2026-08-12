import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { GatewayAccountEntity } from '../auth/entities/index.js';
import type { GatewayAccountRecord, GatewayAccountStore } from './gateway-onboarding.service.js';

@Injectable()
export class TypeOrmGatewayAccountStore implements GatewayAccountStore {
  constructor(private readonly database: DatabaseService) {}
  async createPending(record: GatewayAccountRecord): Promise<void> {
    await this.database.getDataSource().manager.insert(GatewayAccountEntity, this.entity(record));
  }
  async findByMerchant(merchantId: string): Promise<GatewayAccountRecord | undefined> {
    const entity = await this.database
      .getDataSource()
      .manager.findOne(GatewayAccountEntity, { where: { merchantId } });
    return entity ? this.record(entity) : undefined;
  }
  async update(record: GatewayAccountRecord): Promise<void> {
    await this.database
      .getDataSource()
      .manager.update(
        GatewayAccountEntity,
        { id: record.id, merchantId: record.merchantId },
        this.entity(record)
      );
  }
  private entity(record: GatewayAccountRecord): Partial<GatewayAccountEntity> {
    return {
      id: record.id,
      merchantId: record.merchantId,
      status: record.status,
      expectedDocument: record.expectedDocument,
      expectedPersonType: record.expectedPersonType,
      gatewayUserId: record.gatewayUserId ?? null,
      codigoClienteCiphertext: record.codigoClienteCiphertext ?? null,
      chaveLojaCiphertext: record.chaveLojaCiphertext ?? null,
      accessTokenCiphertext: record.accessTokenCiphertext ?? null,
      lastErrorCode: record.lastErrorCode ?? null
    };
  }
  private record(entity: GatewayAccountEntity): GatewayAccountRecord {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      status: entity.status,
      expectedDocument: entity.expectedDocument ?? '',
      expectedPersonType: entity.expectedPersonType ?? 'PF',
      ...(entity.gatewayUserId ? { gatewayUserId: entity.gatewayUserId } : {}),
      ...(entity.codigoClienteCiphertext
        ? { codigoClienteCiphertext: entity.codigoClienteCiphertext }
        : {}),
      ...(entity.chaveLojaCiphertext ? { chaveLojaCiphertext: entity.chaveLojaCiphertext } : {}),
      ...(entity.accessTokenCiphertext
        ? { accessTokenCiphertext: entity.accessTokenCiphertext }
        : {}),
      ...(entity.lastErrorCode ? { lastErrorCode: entity.lastErrorCode } : {})
    };
  }
}
