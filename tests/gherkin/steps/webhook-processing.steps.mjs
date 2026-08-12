import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';

Given('um pagamento já aprovado por webhook', function () {
  this.webhookState = { status: 'APPROVED', transitions: 1 };
});
When('o mesmo resultado aprovado for entregue novamente', function () {
  this.webhookState.event = 'PROCESSED';
});
Then('o evento duplicado será concluído sem nova transição', function () {
  assert.deepEqual(this.webhookState, { status: 'APPROVED', transitions: 1, event: 'PROCESSED' });
});
Given('um pagamento já negado por webhook', function () {
  this.webhookState = { status: 'DENIED', transitions: 1 };
});
When('um resultado aprovado conflitante chegar fora de ordem', function () {
  this.webhookState.event = 'UNPROCESSABLE';
});
Then('o evento será marcado para revisão sem alterar o pagamento', function () {
  assert.deepEqual(this.webhookState, { status: 'DENIED', transitions: 1, event: 'UNPROCESSABLE' });
});
