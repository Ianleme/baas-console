import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';

Given('uma tentativa local aguardando reconciliação', function () {
  this.reconciliation = { local: 'RECONCILIATION_PENDING' };
});
When('a consulta remota confirmar aprovação com os mesmos dados', function () {
  this.reconciliation.classification = 'MATCHED';
});
Then('a operação será classificada como conciliada', function () {
  assert.equal(this.reconciliation.classification, 'MATCHED');
});
Given('um item remoto sem referência local', function () {
  this.reconciliation = { local: null };
});
When('o extrato remoto for comparado com as operações do lojista', function () {
  this.reconciliation.classification = 'GATEWAY_ONLY';
});
Then('o item será classificado como existente apenas no gateway', function () {
  assert.equal(this.reconciliation.classification, 'GATEWAY_ONLY');
});
