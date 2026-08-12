import { randomUUID } from 'node:crypto';

import {
  LeraBoxDependencyError,
  type GatewayRegistration,
  type GatewaySession,
  type GatewayUserProfile
} from '../../integrations/lera-box/auth/lera-box-identity.client.js';
import type { GatewayAccountStatus } from '../auth/entities/gateway-account.entity.js';
import type { EncryptionService } from './encryption.service.js';

export interface GatewayIdentityPort {
  registerUser(input: GatewayRegistration): Promise<void>;
  login(input: { document: string; password: string }): Promise<GatewaySession>;
  getCurrentUser(token: string): Promise<GatewayUserProfile>;
  profilesMatch(
    profile: GatewayUserProfile,
    expected: { document: string; personType: 'PF' | 'PJ' }
  ): boolean;
}

export interface GatewayAccountRecord {
  id: string;
  merchantId: string;
  status: GatewayAccountStatus;
  expectedDocument: string;
  expectedPersonType: 'PF' | 'PJ';
  gatewayUserId?: string;
  codigoClienteCiphertext?: Buffer;
  chaveLojaCiphertext?: Buffer;
  accessTokenCiphertext?: Buffer;
  lastErrorCode?: string;
}

export interface GatewayAccountStore {
  createPending(record: GatewayAccountRecord): Promise<void>;
  findByMerchant(merchantId: string): Promise<GatewayAccountRecord | undefined>;
  update(record: GatewayAccountRecord): Promise<void>;
}

export class GatewayOnboardingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GatewayOnboardingError';
  }
}

export class GatewayOnboardingService {
  constructor(
    private readonly gateway: GatewayIdentityPort,
    private readonly store: GatewayAccountStore,
    private readonly encryption: EncryptionService
  ) {}

  async register(merchantId: string, input: GatewayRegistration): Promise<GatewayAccountRecord> {
    if (await this.store.findByMerchant(merchantId))
      throw new GatewayOnboardingError('REGISTRATION_ALREADY_ATTEMPTED');
    const record: GatewayAccountRecord = {
      id: randomUUID(),
      merchantId,
      status: 'REGISTRATION_PENDING',
      expectedDocument: input.document,
      expectedPersonType: input.personType
    };
    await this.store.createPending(record);
    try {
      await this.gateway.registerUser(input);
      record.status = 'AWAITING_CREDENTIALS';
    } catch (error) {
      record.status =
        error instanceof LeraBoxDependencyError && error.code === 'LERA_BOX_TIMEOUT'
          ? 'GATEWAY_REGISTRATION_UNKNOWN'
          : 'GATEWAY_REGISTRATION_FAILED';
      record.lastErrorCode = record.status;
    }
    await this.store.update(record);
    return record;
  }

  async connect(
    merchantId: string,
    document: string,
    password: string
  ): Promise<GatewayAccountRecord> {
    const record = await this.store.findByMerchant(merchantId);
    if (record?.status !== 'AWAITING_CREDENTIALS')
      throw new GatewayOnboardingError('CONNECTION_NOT_ALLOWED');
    const session = await this.gateway.login({ document, password });
    const profile = await this.gateway.getCurrentUser(session.accessToken);
    if (
      !this.gateway.profilesMatch(profile, {
        document: record.expectedDocument,
        personType: record.expectedPersonType
      })
    ) {
      record.status = 'ERROR';
      record.lastErrorCode = 'GATEWAY_PROFILE_MISMATCH';
      await this.store.update(record);
      throw new GatewayOnboardingError('GATEWAY_PROFILE_MISMATCH');
    }
    record.gatewayUserId = profile.id;
    record.codigoClienteCiphertext = this.encryption.encrypt(
      String(session.codigoCliente),
      merchantId,
      record.id,
      'codigoCliente'
    );
    record.chaveLojaCiphertext = this.encryption.encrypt(
      session.chaveLoja,
      merchantId,
      record.id,
      'chaveLoja'
    );
    record.accessTokenCiphertext = this.encryption.encrypt(
      session.accessToken,
      merchantId,
      record.id,
      'accessToken'
    );
    record.status = 'ACTIVE';
    delete record.lastErrorCode;
    await this.store.update(record);
    return record;
  }
}
