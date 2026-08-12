import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { EncryptionService } from '../../../apps/api/dist/modules/gateway-accounts/encryption.service.js';
import { GatewayOnboardingService } from '../../../apps/api/dist/modules/gateway-accounts/gateway-onboarding.service.js';
import { LeraBoxTimeoutError } from '../../../apps/api/dist/integrations/lera-box/auth/lera-box-identity.client.js';

const registration = {
  personType: 'PF',
  name: 'Owner',
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
const profile = {
  id: 'gateway-user',
  personType: 'PF',
  name: 'Owner',
  tradingName: 'Store',
  email: registration.email,
  phone: registration.phone,
  document: '123',
  codigoCliente: 42,
  chaveLoja: 'key',
  emailConfirmed: true,
  createdAt: 'date'
};

function setup(world) {
  world.store = {
    record: undefined,
    createPending(record) {
      this.record = record;
      return Promise.resolve();
    },
    findByMerchant(id) {
      return Promise.resolve(this.record?.merchantId === id ? this.record : undefined);
    },
    update(record) {
      this.record = record;
      return Promise.resolve();
    }
  };
  world.gateway = {
    calls: 0,
    registrationError: undefined,
    returnedProfile: profile,
    registerUser() {
      this.calls++;
      return this.registrationError ? Promise.reject(this.registrationError) : Promise.resolve();
    },
    login() {
      return Promise.resolve({
        accessToken: 'token',
        tokenType: 'Bearer',
        codigoCliente: 42,
        chaveLoja: 'key',
        user: { ...profile }
      });
    },
    getCurrentUser() {
      return Promise.resolve(this.returnedProfile);
    },
    profilesMatch(actual, expected) {
      return actual.document === expected.document && actual.personType === expected.personType;
    }
  };
  world.service = new GatewayOnboardingService(
    world.gateway,
    world.store,
    new EncryptionService(Buffer.alloc(32, 7))
  );
}

Given('um lojista sem tentativa de cadastro', function () {
  setup(this);
});
Given('um cadastro remoto que termina em timeout', function () {
  setup(this);
  this.gateway.registrationError = new LeraBoxTimeoutError('register-user');
});
Given('um lojista aguardando credenciais', async function () {
  setup(this);
  await this.service.register('tenant-a', registration);
});
When('o cadastro remoto for aceito', async function () {
  this.result = await this.service.register('tenant-a', registration);
});
When('o cadastro for solicitado', async function () {
  this.result = await this.service.register('tenant-a', registration);
});
When('as credenciais pertencerem a outro documento', async function () {
  this.gateway.returnedProfile = { ...profile, document: 'other' };
  try {
    await this.service.connect('tenant-a', '123', 'password');
  } catch (error) {
    this.error = error;
  }
});
When('as credenciais confirmarem o perfil esperado', async function () {
  this.result = await this.service.connect('tenant-a', '123', 'one-time-secret');
});
Then('a conexao deve aguardar as credenciais recebidas por email', function () {
  assert.equal(this.result.status, 'AWAITING_CREDENTIALS');
});
Then('a tentativa deve ficar com resultado desconhecido sem retry', function () {
  assert.equal(this.result.status, 'GATEWAY_REGISTRATION_UNKNOWN');
  assert.equal(this.gateway.calls, 1);
});
Then('a conexao deve ser recusada por divergencia de perfil', function () {
  assert.equal(this.error.code, 'GATEWAY_PROFILE_MISMATCH');
  assert.notEqual(this.store.record.status, 'ACTIVE');
});
Then('a conexao deve ficar ativa sem persistir a senha', function () {
  assert.equal(this.result.status, 'ACTIVE');
  assert.equal(JSON.stringify(this.result).includes('one-time-secret'), false);
});
