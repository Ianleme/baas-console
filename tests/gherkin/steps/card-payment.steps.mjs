import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { CardPaymentService } from '../../../apps/api/dist/modules/payments/card/card-payment.service.js';
import { LeraBoxTimeoutError } from '../../../apps/api/dist/integrations/lera-box/auth/lera-box-identity.client.js';

const approved = {
  gatewayPaymentId: 'gateway',
  status: 'APPROVED',
  externalReference: 'ref',
  brand: 'VISA',
  last4: '1111',
  installments: 3,
  feeBps: 319,
  feeAmountCents: '3',
  netAmountCents: '97',
  denialReason: null
};
const card = {
  number: '4111111111111111',
  holder: 'CLIENTE SANDBOX',
  expiryMonth: 12,
  expiryYear: 2030,
  cvv: '123'
};
function setup(world) {
  world.calls = 0;
  world.attempts = [];
  world.paid = new Set();
  world.currentFee = 319;
  world.fees = {
    list: () =>
      Promise.resolve([{ id: 'fee', brand: 'VISA', installments: 3, feeBps: world.currentFee }])
  };
  world.gateway = {
    create: () => {
      world.calls += 1;
      return world.gatewayError ? Promise.reject(world.gatewayError) : Promise.resolve(approved);
    }
  };
  world.store = {
    countRecentDenials: () => Promise.resolve(0),
    begin: (input) => {
      const attempt = { ...input, status: 'PROCESSING', gatewayPaymentId: null, failureCode: null };
      world.attempts.push(attempt);
      return Promise.resolve(attempt);
    },
    transition: (id, _expected, update) => {
      const attempt = world.attempts.find((item) => item.id === id);
      Object.assign(attempt, update);
      return Promise.resolve(attempt);
    },
    markLinkPaid: (id) => {
      world.paid.add(id);
      return Promise.resolve();
    }
  };
  let id = 0;
  world.service = new CardPaymentService(
    world.fees,
    world.gateway,
    world.store,
    () => `id-${++id}`,
    () => new Date('2026-08-12T00:00:00Z')
  );
}
async function input(world) {
  return {
    merchantId: 'merchant',
    checkoutLinkId: 'link',
    accessToken: 'token',
    description: 'Pedido',
    quote: await world.service.quote('100', 'VISA', 3),
    card
  };
}
Given('um checkout cartão com taxa confirmada', async function () {
  setup(this);
  this.input = await input(this);
});
When('o gateway aprovar o cartão', async function () {
  this.result = await this.service.confirm(this.input);
});
When('a taxa do cartão mudar antes da confirmação', async function () {
  this.currentFee = 400;
  try {
    await this.service.confirm(this.input);
  } catch (error) {
    this.error = error;
  }
});
When('o gateway cartão terminar sem resposta conclusiva', async function () {
  this.gatewayError = new LeraBoxTimeoutError('create-card');
  this.result = await this.service.confirm(this.input);
});
Then('a tentativa cartão e o link devem ficar aprovados', function () {
  assert.equal(this.result.attempt.status, 'APPROVED');
  assert.equal(this.paid.has('link'), true);
});
Then('nenhum pagamento cartão deve ser enviado', function () {
  assert.equal(this.error.code, 'FEE_CHANGED');
  assert.equal(this.calls, 0);
});
Then('o cartão deve aguardar conciliação após uma única chamada', function () {
  assert.equal(this.result.httpStatus, 202);
  assert.equal(this.result.attempt.status, 'RECONCILIATION_PENDING');
  assert.equal(this.calls, 1);
});
