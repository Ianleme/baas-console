import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { LeraBoxStub, signWebhook } from './lera-box-stub.js';

const activeStubs: LeraBoxStub[] = [];

async function startStub(options?: ConstructorParameters<typeof LeraBoxStub>[0]) {
  const stub = new LeraBoxStub(options);
  activeStubs.push(stub);
  await stub.start();
  return stub;
}

afterEach(async () => {
  await Promise.all(
    activeStubs.splice(0).map(async (stub) => {
      await stub.stop();
    })
  );
});

void test('serves the sanitized login fixture deterministically', async () => {
  const stub = await startStub();
  const response = await fetch(`${stub.baseUrl}/api/auth/login`, { method: 'POST', body: '{}' });
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 201);
  assert.equal(body.token_type, 'Bearer');
});

void test('serves profile and wallet fixture boundaries', async () => {
  const stub = await startStub();
  const profile = await fetch(`${stub.baseUrl}/api/users/me`);
  const wallet = await fetch(`${stub.baseUrl}/api/wallet`);
  assert.equal(profile.status, 200);
  assert.equal(wallet.status, 200);
});

void test('serves the filtered fees path without depending on query order', async () => {
  const stub = await startStub();
  const response = await fetch(`${stub.baseUrl}/api/fees?brand=VISA`);
  const body = (await response.json()) as { total: number };
  assert.equal(response.status, 200);
  assert.equal(body.total, 63);
});

void test('matches an expected request body independent of object key order', async () => {
  const stub = await startStub({
    expectedRequests: [
      { method: 'POST', path: '/api/payments/pix', body: { amount: 100, payerDocument: 'fixture' } }
    ]
  });
  const response = await fetch(`${stub.baseUrl}/api/payments/pix`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payerDocument: 'fixture', amount: 100 })
  });
  assert.equal(response.status, 201);
  stub.assertSatisfied();
});

void test('rejects a request that diverges from the expected fixture', async () => {
  const stub = await startStub({
    expectedRequests: [{ method: 'POST', path: '/api/payments/pix', body: { amount: 100 } }]
  });
  const response = await fetch(`${stub.baseUrl}/api/payments/pix`, {
    method: 'POST',
    body: '{"amount":200}'
  });
  assert.equal(response.status, 422);
  assert.throws(() => {
    stub.assertSatisfied();
  }, /EXPECTATION_UNSATISFIED/u);
});

void test('never echoes authorization or secret headers', async () => {
  const stub = await startStub();
  const response = await fetch(`${stub.baseUrl}/api/wallet`, {
    headers: { authorization: 'Bearer must-not-echo', 'x-webhook-secret': 'must-not-echo' }
  });
  const body = await response.text();
  assert.equal(body.includes('must-not-echo'), false);
});

void test('serves a stable validation failure scenario', async () => {
  const stub = await startStub();
  const response = await fetch(`${stub.baseUrl}/api/payments/pix`, {
    method: 'POST',
    headers: { 'x-lera-box-scenario': 'validation-error' },
    body: '{}'
  });
  const body = (await response.json()) as { statusCode: number };
  assert.equal(response.status, 400);
  assert.equal(body.statusCode, 400);
});

void test('reproduces a timeout that the caller can abort', async () => {
  const stub = await startStub({ timeoutDelayMs: 100 });
  const signal = AbortSignal.timeout(10);
  await assert.rejects(
    fetch(`${stub.baseUrl}/api/wallet`, { headers: { 'x-lera-box-scenario': 'timeout' }, signal }),
    /abort|timeout/iu
  );
});

void test('reproduces an interrupted connection', async () => {
  const stub = await startStub();
  await assert.rejects(
    fetch(`${stub.baseUrl}/api/wallet`, { headers: { 'x-lera-box-scenario': 'disconnect' } })
  );
});

void test('returns 404 for an endpoint without a fixture', async () => {
  const stub = await startStub();
  const response = await fetch(`${stub.baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
});

void test('creates lowercase hexadecimal HMAC over exact raw bytes', () => {
  const signed = signWebhook({ event: 'PAYMENT_PIX', amount: 100 }, 'fixture-secret');
  const expected = createHmac('sha256', 'fixture-secret').update(signed.rawBody).digest('hex');
  assert.equal(signed.headers['x-lera-box-signature'], expected);
  assert.match(expected, /^[a-f0-9]{64}$/u);
});

void test('includes the exact event header in signed webhook delivery', () => {
  const signed = signWebhook({ event: 'WITHDRAWAL', status: 'APPROVED' }, 'fixture-secret');
  assert.equal(signed.headers['x-lera-box-event'], 'WITHDRAWAL');
});

void test('a different secret cannot reproduce the signed webhook', () => {
  const signed = signWebhook({ event: 'PAYMENT_CARD', status: 'APPROVED' }, 'fixture-secret');
  const wrong = createHmac('sha256', 'wrong-secret').update(signed.rawBody).digest('hex');
  assert.notEqual(signed.headers['x-lera-box-signature'], wrong);
});
