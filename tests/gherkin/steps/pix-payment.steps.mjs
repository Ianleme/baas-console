import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { PixPaymentService } from '../../../apps/api/dist/modules/payments/pix/pix-payment.service.js';
import { LeraBoxTimeoutError } from '../../../apps/api/dist/integrations/lera-box/auth/lera-box-identity.client.js';

const approved = {
  gatewayPaymentId: 'gateway',
  status: 'APPROVED',
  externalReference: 'external',
  txid: 'txid',
  emv: 'emv',
  qrCodeBase64: 'qr',
  denialReason: null
};
const input = {
  merchantId: 'merchant',
  checkoutLinkId: 'link',
  amountCents: '100',
  description: 'Pedido',
  payerDocument: '52998224725',
  accessToken: 'token'
};
function setup(world) {
  world.calls = 0;
  world.paid = new Set();
  world.attempts = [];
  world.gateway = {
    create: () => {
      world.calls += 1;
      return world.gatewayResult instanceof Error
        ? Promise.reject(world.gatewayResult)
        : Promise.resolve(world.gatewayResult ?? approved);
    }
  };
  world.store = {
    begin: (record) => {
      if (
        world.attempts.some((item) =>
          ['PROCESSING', 'PENDING', 'RECONCILIATION_PENDING'].includes(item.status)
        )
      )
        return Promise.reject(new Error('unresolved'));
      const attempt = {
        ...record,
        status: 'PROCESSING',
        gatewayPaymentId: null,
        txid: null,
        emv: null,
        qrCodeBase64: null,
        failureCode: null
      };
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
  world.service = new PixPaymentService(world.gateway, world.store, () => `id-${++id}`);
}
Given('um checkout Pix válido', function () {
  setup(this);
});
Given('um Pix aguardando conciliação', async function () {
  setup(this);
  this.gatewayResult = new LeraBoxTimeoutError('create-pix');
  this.result = await this.service.start(input);
});
When('o gateway aprovar o Pix', async function () {
  this.result = await this.service.start(input);
});
When('o gateway Pix terminar sem resposta conclusiva', async function () {
  this.gatewayResult = new LeraBoxTimeoutError('create-pix');
  this.result = await this.service.start(input);
});
When('chegar uma aprovação Pix tardia', async function () {
  this.result.attempt = await this.service.applyLateOutcome(this.result.attempt.id, approved);
});
Then('a tentativa Pix e o link devem ficar aprovados', function () {
  assert.equal(this.result.attempt.status, 'APPROVED');
  assert.equal(this.paid.has('link'), true);
});
Then('o Pix deve aguardar conciliação após uma única chamada', function () {
  assert.equal(this.result.httpStatus, 202);
  assert.equal(this.result.attempt.status, 'RECONCILIATION_PENDING');
  assert.equal(this.calls, 1);
});
Then('a aprovação Pix deve prevalecer sem outra transação', function () {
  assert.equal(this.result.attempt.status, 'APPROVED');
  assert.equal(this.attempts.length, 1);
  assert.equal(this.calls, 1);
});
