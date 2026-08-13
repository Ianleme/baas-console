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
    return (await this.activeAuth(merchantId)).accessToken;
  }

  async activeAuth(merchantId: string): Promise<{ accessToken: string; document: string }> {
    const account = await this.database.getDataSource().manager.findOne(GatewayAccountEntity, {
      where: { merchantId, status: 'ACTIVE' }
    });
    if (!account?.accessTokenCiphertext) throw new Error('GATEWAY_ACCOUNT_NOT_ACTIVE');
    if (!account.expectedDocument) throw new Error('GATEWAY_DOCUMENT_MISSING');
    return {
      accessToken: this.encryption.decrypt(
        account.accessTokenCiphertext,
        merchantId,
        account.id,
        'accessToken'
      ),
      document: account.expectedDocument.replace(/\D/g, '')
    };
  }
}
