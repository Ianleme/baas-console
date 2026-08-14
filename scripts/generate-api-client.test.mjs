import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  GeneratedClientDriftError,
  checkGeneratedClient,
  generateClientSource,
  loadOpenApiDocument
} from './generate-api-client.mjs';

test('generates schema paths from the real Nest OpenAPI document', async () => {
  const document = await loadOpenApiDocument();
  const source = await generateClientSource(document);
  assert.match(source, /['"]\/health\/live['"]/u);
  assert.match(source, /['"]\/health\/ready['"]/u);
});

test('publishes typed payment-link pagination parameters and response envelope', async () => {
  const document = await loadOpenApiDocument();
  const operation = JSON.stringify(document.paths['/api/v1/checkout-links']?.get);
  for (const field of ['search', 'status', 'method', 'from', 'to', 'limit', 'offset']) {
    assert.match(operation, new RegExp(`"name":"${field}"`, 'u'));
  }
  assert.match(operation, /ListCheckoutLinksResponseDto/u);
  const responseSchema = JSON.stringify(document.components?.schemas?.ListCheckoutLinksResponseDto);
  for (const field of ['items', 'total', 'summary'])
    assert.match(responseSchema, new RegExp(field, 'u'));
});

test('loads the OpenAPI document without incidental runtime secrets', async () => {
  const names = [
    'AUTH_TOKEN_SECRET',
    'ENCRYPTION_KEY_BASE64',
    'LERA_BOX_BASE_URL',
    'PUBLIC_API_BASE_URL',
    'PUBLIC_CHECKOUT_BASE_URL'
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    const document = await loadOpenApiDocument();
    assert.ok(Object.keys(document.paths).length >= 21);
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('generates byte-identical client source for the same contract', async () => {
  const document = await loadOpenApiDocument();
  const first = await generateClientSource(document);
  const second = await generateClientSource(structuredClone(document));
  assert.equal(first, second);
});

test('accepts an up-to-date generated client', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'baas-api-client-'));
  const path = join(directory, 'schema.ts');
  const document = await loadOpenApiDocument();
  writeFileSync(path, await generateClientSource(document), 'utf8');
  const result = await checkGeneratedClient(path, document);
  assert.deepEqual(result, { status: 'current' });
});

test('rejects generated client drift with a stable diagnostic', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'baas-api-client-'));
  const path = join(directory, 'schema.ts');
  const document = await loadOpenApiDocument();
  writeFileSync(path, `${await generateClientSource(document)}// stale\n`, 'utf8');
  await assert.rejects(
    () => checkGeneratedClient(path, document),
    (error) =>
      error instanceof GeneratedClientDriftError && error.message === 'API_CLIENT_DRIFT_DETECTED'
  );
  assert.match(readFileSync(path, 'utf8'), /stale/u);
});
