import type {
  GatewayRegistration,
  GatewaySession,
  GatewayUserProfile
} from '../../src/integrations/lera-box/auth/lera-box-identity.client.js';
import {
  LeraBoxDependencyError,
  LeraBoxTimeoutError
} from '../../src/integrations/lera-box/auth/lera-box-identity.client.js';
import { EncryptionService } from '../../src/modules/gateway-accounts/encryption.service.js';
import {
  GatewayOnboardingService,
  type GatewayAccountRecord,
  type GatewayAccountStore,
  type GatewayIdentityPort
} from '../../src/modules/gateway-accounts/gateway-onboarding.service.js';

const registration: GatewayRegistration = {
  personType: 'PF',
  name: 'Owner',
  tradingName: 'Store',
  email: 'owner@example.test',
  phone: '11999999999',
  document: '123',
  zipCode: '01001000',
  address: 'Street',
  number: '1',
  neighborhood: 'Center',
  city: 'Sao Paulo',
  state: 'SP'
};
const profile: GatewayUserProfile = {
  id: 'gateway-user',
  personType: 'PF',
  name: 'Owner',
  tradingName: 'Store',
  email: registration.email,
  phone: registration.phone,
  document: registration.document,
  codigoCliente: 42,
  chaveLoja: 'store-key',
  emailConfirmed: true,
  createdAt: '2026-08-12'
};
const session: GatewaySession = {
  accessToken: 'access-secret',
  tokenType: 'Bearer',
  codigoCliente: 42,
  chaveLoja: 'store-key',
  user: {
    id: profile.id,
    personType: 'PF',
    name: 'Owner',
    tradingName: 'Store',
    email: registration.email,
    document: registration.document
  }
};

class Store implements GatewayAccountStore {
  record?: GatewayAccountRecord;
  creates = 0;
  updates = 0;
  createPending(record: GatewayAccountRecord): Promise<void> {
    this.creates++;
    this.record = record;
    return Promise.resolve();
  }
  findByMerchant(id: string): Promise<GatewayAccountRecord | undefined> {
    return Promise.resolve(this.record?.merchantId === id ? this.record : undefined);
  }
  update(record: GatewayAccountRecord): Promise<void> {
    this.updates++;
    this.record = record;
    return Promise.resolve();
  }
}
class Gateway implements GatewayIdentityPort {
  registerCalls = 0;
  loginInput?: { document: string; password: string };
  registrationError?: Error;
  returnedProfile = profile;
  registerUser(): Promise<void> {
    this.registerCalls++;
    return this.registrationError ? Promise.reject(this.registrationError) : Promise.resolve();
  }
  login(input: { document: string; password: string }): Promise<GatewaySession> {
    this.loginInput = input;
    return Promise.resolve(session);
  }
  getCurrentUser(token: string): Promise<GatewayUserProfile> {
    if (token !== session.accessToken) throw new Error('token');
    return Promise.resolve(this.returnedProfile);
  }
  profilesMatch(
    actual: GatewayUserProfile,
    expected: { document: string; personType: 'PF' | 'PJ' }
  ): boolean {
    return (
      actual.document.replace(/\D/g, '') === expected.document.replace(/\D/g, '') &&
      actual.personType === expected.personType
    );
  }
}

describe('GatewayOnboardingService', () => {
  let store: Store;
  let gateway: Gateway;
  let encryption: EncryptionService;
  let service: GatewayOnboardingService;
  beforeEach(() => {
    store = new Store();
    gateway = new Gateway();
    encryption = new EncryptionService(Buffer.alloc(32, 7));
    service = new GatewayOnboardingService(gateway, store, encryption);
  });
  it('records pending before making exactly one remote registration', async () => {
    await service.register('tenant-a', registration);
    expect(store.creates).toBe(1);
    expect(gateway.registerCalls).toBe(1);
  });
  it('moves accepted registration to awaiting credentials', async () => {
    await expect(service.register('tenant-a', registration)).resolves.toMatchObject({
      status: 'AWAITING_CREDENTIALS'
    });
  });
  it('marks conclusive registration failure', async () => {
    gateway.registrationError = new LeraBoxDependencyError(
      'register-user',
      'LERA_BOX_CONCLUSIVE_FAILURE',
      400,
      '{"message":"denied"}'
    );
    await expect(service.register('tenant-a', registration)).resolves.toMatchObject({
      status: 'GATEWAY_REGISTRATION_FAILED',
      lastErrorCode: 'LERA_BOX_CONCLUSIVE_FAILURE_400'
    });
  });
  it('marks timeout as unknown', async () => {
    gateway.registrationError = new LeraBoxTimeoutError('register-user');
    await expect(service.register('tenant-a', registration)).resolves.toMatchObject({
      status: 'GATEWAY_REGISTRATION_UNKNOWN'
    });
  });
  it('never automatically retries an existing attempt', async () => {
    await service.register('tenant-a', registration);
    await expect(service.register('tenant-a', registration)).rejects.toMatchObject({
      code: 'REGISTRATION_ALREADY_ATTEMPTED'
    });
    expect(gateway.registerCalls).toBe(1);
  });
  it('passes the gateway password only to login', async () => {
    await service.register('tenant-a', registration);
    const record = await service.connect('tenant-a', '123', 'one-time-secret');
    expect(gateway.loginInput).toEqual({ document: '123', password: 'one-time-secret' });
    expect(JSON.stringify(record)).not.toContain('one-time-secret');
  });
  it('requires awaiting state to connect', async () => {
    await expect(service.connect('tenant-a', '123', 'password')).rejects.toMatchObject({
      code: 'CONNECTION_NOT_ALLOWED'
    });
  });
  it('verifies the remote profile before activation', async () => {
    await service.register('tenant-a', registration);
    await expect(service.connect('tenant-a', '123', 'password')).resolves.toMatchObject({
      status: 'ACTIVE',
      gatewayUserId: 'gateway-user'
    });
  });
  it('rejects a document mismatch', async () => {
    await service.register('tenant-a', registration);
    gateway.returnedProfile = { ...profile, document: 'other' };
    await expect(service.connect('tenant-a', '123', 'password')).rejects.toMatchObject({
      code: 'GATEWAY_PROFILE_MISMATCH'
    });
    expect(store.record?.status).toBe('AWAITING_CREDENTIALS');
  });
  it('matches the same document with or without punctuation', async () => {
    await service.register('tenant-a', { ...registration, document: '385.477.020-08' });
    gateway.returnedProfile = { ...profile, document: '38547702008' };
    await expect(service.connect('tenant-a', '385.477.020-08', 'password')).resolves.toMatchObject({
      status: 'ACTIVE'
    });
  });
  it('rejects a person-type mismatch', async () => {
    await service.register('tenant-a', registration);
    gateway.returnedProfile = { ...profile, personType: 'PJ' };
    await expect(service.connect('tenant-a', '123', 'password')).rejects.toMatchObject({
      code: 'GATEWAY_PROFILE_MISMATCH'
    });
  });
  it('encrypts every persisted gateway credential', async () => {
    await service.register('tenant-a', registration);
    const record = await service.connect('tenant-a', '123', 'password');
    expect(record.accessTokenCiphertext?.toString()).not.toContain('access-secret');
    expect(record.chaveLojaCiphertext?.toString()).not.toContain('store-key');
  });
  it('decrypts credentials only with matching tenant and field AAD', async () => {
    await service.register('tenant-a', registration);
    const record = await service.connect('tenant-a', '123', 'password');
    const ciphertext = record.accessTokenCiphertext;
    if (!ciphertext) throw new Error('TEST_CIPHERTEXT_MISSING');
    expect(encryption.decrypt(ciphertext, 'tenant-a', record.id, 'accessToken')).toBe(
      'access-secret'
    );
    expect(() => encryption.decrypt(ciphertext, 'tenant-b', record.id, 'accessToken')).toThrow(
      'DECRYPTION_FAILED'
    );
  });
  it('uses a unique nonce for repeated plaintext', () => {
    const first = encryption.encrypt('same', 't', 'r', 'f');
    const second = encryption.encrypt('same', 't', 'r', 'f');
    expect(first.equals(second)).toBe(false);
  });
  it('rejects the wrong encryption key', () => {
    const encrypted = encryption.encrypt('secret', 't', 'r', 'f');
    expect(() =>
      new EncryptionService(Buffer.alloc(32, 8)).decrypt(encrypted, 't', 'r', 'f')
    ).toThrow('DECRYPTION_FAILED');
  });
  it('rejects tampered ciphertext', () => {
    const encrypted = encryption.encrypt('secret', 't', 'r', 'f');
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => encryption.decrypt(encrypted, 't', 'r', 'f')).toThrow('DECRYPTION_FAILED');
  });
  it('requires a 256-bit key', () => {
    expect(() => new EncryptionService(Buffer.alloc(16))).toThrow(
      'ENCRYPTION_KEY_MUST_BE_32_BYTES'
    );
  });
});
