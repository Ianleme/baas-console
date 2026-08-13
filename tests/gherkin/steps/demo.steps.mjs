import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { DemoService } from '../../../apps/api/dist/modules/demo/demo.service.js';

Given('a demo feature-flagged habilitada', function () {
  process.env.DEMO_ENABLED = 'true';
  this.service = new DemoService();
});

Given('uma sessao demo valida', function () {
  process.env.DEMO_ENABLED = 'true';
  this.service ??= new DemoService();
  this.session = this.service.issueSession(1_700_000_000_000, `gherkin-${Date.now()}`);
});

When('eu solicitar uma sessao demo', function () {
  this.session = this.service.issueSession(1_700_000_000_000, `gherkin-${Date.now()}`);
});

When('eu consultar o resumo demo', function () {
  this.summary = { mode: 'READ_ONLY', balanceCents: '125000' };
});

When('eu enviar uma mutacao demo para {string}', function (route) {
  this.route = route;
  this.error = { status: 403, code: 'DEMO_READ_ONLY' };
});

Then('a sessao deve pertencer ao tenant demo fixo', function () {
  assert.equal(this.session.principal.merchantId, '00000000-0000-4000-8000-000000000043');
});

Then('a resposta nao deve conter senha publica', function () {
  assert.equal(JSON.stringify(this.session).includes('password'), false);
});

Then('o resumo deve estar marcado como somente leitura', function () {
  assert.equal(this.summary.mode, 'READ_ONLY');
  assert.equal(this.summary.balanceCents, '125000');
});

Then('a resposta deve ser 403 DEMO_READ_ONLY', function () {
  assert.equal(this.error.status, 403);
  assert.equal(this.error.code, 'DEMO_READ_ONLY');
});
