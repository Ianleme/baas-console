import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { GatewayAccountEntity } from '../auth/entities/gateway-account.entity.js';
import { EncryptionService } from './encryption.service.js';

@Injectable()
export class GatewayCredentialService {
  constructor(
    private readonly database: DatabaseService,
    private readonly encryption: EncryptionService
  ) {}

  async accessToken(merchantId: string): Promise<string> {
    const account = await this.database.getDataSource().manager.findOne(GatewayAccountEntity, {
      where: { merchantId, status: 'ACTIVE' }
    });
    if (!account?.accessTokenCiphertext) throw new Error('GATEWAY_ACCOUNT_NOT_ACTIVE');
    return this.encryption.decrypt(
      account.accessTokenCiphertext,
      merchantId,
      account.id,
      'accessToken'
    );
  }
}
