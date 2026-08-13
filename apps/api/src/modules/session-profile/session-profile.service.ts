import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { AuthError, AuthService } from '../auth/auth.service.js';
import { GatewayAccountEntity, MerchantEntity, UserEntity } from '../auth/entities/index.js';

export interface CurrentProfile {
  merchant: { legalName: string; displayName: string };
  owner: { fullName: string; email: string };
  gatewayConnectionStatus: string | null;
}

@Injectable()
export class SessionProfileService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService
  ) {}

  async getCurrentProfile(token: string): Promise<CurrentProfile> {
    const principal = this.auth.verifyAccessToken(token);
    const manager = this.database.getDataSource().manager;
    const [user, merchant, gateway] = await Promise.all([
      manager.findOne(UserEntity, {
        where: { id: principal.userId, merchantId: principal.merchantId }
      }),
      manager.findOne(MerchantEntity, { where: { id: principal.merchantId } }),
      manager.findOne(GatewayAccountEntity, { where: { merchantId: principal.merchantId } })
    ]);
    if (!user || !merchant) throw new AuthError('AUTH_REQUIRED');
    return {
      merchant: { legalName: merchant.legalName, displayName: merchant.displayName },
      owner: { fullName: user.fullName ?? user.email, email: user.email },
      gatewayConnectionStatus: gateway?.status ?? null
    };
  }
}
