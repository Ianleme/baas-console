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
