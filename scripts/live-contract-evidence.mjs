import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const evidenceDirectory = resolve(root, 'artifacts/live');
const fixturesDirectory = resolve(root, 'packages/test-support/fixtures/lera-box');
const manifestPath = resolve(fixturesDirectory, 'manifest.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function loadEvidence() {
  const required = ['spike-responses.json', 'events.jsonl', 'webhook-secret.txt'];
  for (const file of required) {
    assert(existsSync(resolve(evidenceDirectory, file)), `LIVE_EVIDENCE_MISSING: ${file}`);
  }

  return {
    responses: readJson(resolve(evidenceDirectory, 'spike-responses.json')),
    events: readFileSync(resolve(evidenceDirectory, 'events.jsonl'), 'utf8')
      .split(/\r?\n/u)
      .filter(Boolean)
      .map(JSON.parse),
    secret: readFileSync(resolve(evidenceDirectory, 'webhook-secret.txt'), 'utf8').trim()
  };
}

function verifyContract() {
  const manifest = readJson(manifestPath);
  const evidence = loadEvidence();
  assert(
    sha256(resolve(evidenceDirectory, 'spike-responses.json')) ===
      manifest.rawEvidence.responsesSha256,
    'LIVE_RESPONSES_HASH_MISMATCH'
  );
  assert(
    sha256(resolve(evidenceDirectory, 'events.jsonl')) === manifest.rawEvidence.eventsSha256,
    'LIVE_EVENTS_HASH_MISMATCH'
  );

  const expectedStatuses = new Map([
    ['POST /api/auth/login', 201],
    ['POST /api/webhooks', 201],
    ['GET /api/webhooks', 200],
    ['POST /api/payments/pix', 201],
    ['GET /api/fees', 200],
    ['POST /api/payments/card', 201],
    ['POST /api/withdrawals', 201]
  ]);
  for (const [operation, status] of expectedStatuses) {
    const [method, ...pathParts] = operation.split(' ');
    const path = pathParts.join(' ');
    assert(
      evidence.responses.some(
        (response) =>
          response.method === method && response.path === path && response.status === status
      ),
      `LIVE_OPERATION_MISSING: ${operation} ${status}`
    );
  }
  assert(
    evidence.responses.filter((response) => response.method === 'DELETE' && response.status === 200)
      .length === 3,
    'LIVE_WEBHOOK_CLEANUP_INCOMPLETE'
  );

  const webhookEvents = evidence.events.filter((event) => event.url.startsWith('/hooks/'));
  assert(webhookEvents.length === 3, 'LIVE_WEBHOOK_EVENT_COUNT_INVALID');
  const observedEvents = new Set();
  for (const event of webhookEvents) {
    const signature = event.headers['x-lera-box-signature'];
    const rawBody = Buffer.from(event.rawBodyBase64, 'base64');
    const expected = createHmac('sha256', evidence.secret).update(rawBody).digest('hex');
    assert(
      typeof signature === 'string' && /^[a-f0-9]{64}$/u.test(signature),
      'LIVE_HMAC_ENCODING_INVALID'
    );
    assert(
      timingSafeEqual(Buffer.from(signature, 'ascii'), Buffer.from(expected, 'ascii')),
      'LIVE_HMAC_INVALID'
    );
    const body = JSON.parse(rawBody.toString('utf8'));
    observedEvents.add(body.event);
  }
  for (const event of ['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL']) {
    assert(observedEvents.has(event), `LIVE_WEBHOOK_TYPE_MISSING: ${event}`);
  }
  process.stdout.write(
    'LIVE_CONTRACT_OK: 7 endpoint families, 3 signed events, cleanup complete\n'
  );
}

function collectSensitiveValues(value, key = '', values = new Set()) {
  const sensitiveKey =
    /^(access_token|chaveLoja|email|phone|document|payerDocument|cardHolder|expiryMonth|expiryYear|pixKey|secret|emv|qrCodeBase64|txid)$/iu;
  if (Array.isArray(value)) {
    value.forEach((item) => collectSensitiveValues(item, key, values));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, child]) =>
      collectSensitiveValues(child, childKey, values)
    );
  } else if (sensitiveKey.test(key) && typeof value === 'string' && value.length >= 4) {
    values.add(value);
  }
  return values;
}

function parseDotEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/u.test(line))
      .map((line) => {
        const separator = line.indexOf('=');
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['"]|['"]$/gu, '')
        ];
      })
  );
}

function validateSanitization() {
  const manifest = readJson(manifestPath);
  const fixturePaths = manifest.fixtures.map((file) => resolve(fixturesDirectory, file));
  fixturePaths.forEach((path) => assert(existsSync(path), `SANITIZED_FIXTURE_MISSING: ${path}`));
  const scannedText = fixturePaths
    .concat(resolve(root, 'docs/integrations/lera-box-contract-spike-2026-08-12.md'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  const evidence = loadEvidence();
  const sensitiveValues = collectSensitiveValues(evidence.responses);
  for (const event of evidence.events) {
    if (event.url.startsWith('/hooks/')) {
      collectSensitiveValues(
        JSON.parse(Buffer.from(event.rawBodyBase64, 'base64').toString('utf8')),
        '',
        sensitiveValues
      );
    }
  }
  const localEnvironment = parseDotEnv(resolve(root, '.env.live.local'));
  Object.values(localEnvironment)
    .filter((value) => value.length >= 4)
    .forEach((value) => sensitiveValues.add(value));
  sensitiveValues.add(evidence.secret);

  for (const value of sensitiveValues) {
    assert(!scannedText.includes(value), 'SANITIZED_FIXTURE_CONTAINS_LIVE_VALUE');
  }
  assert(
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(scannedText),
    'SANITIZED_FIXTURE_CONTAINS_EMAIL'
  );
  assert(!/\b\d{11,16}\b/u.test(scannedText), 'SANITIZED_FIXTURE_CONTAINS_DOCUMENT_OR_CARD');
  process.stdout.write(`LIVE_SANITIZATION_OK: ${fixturePaths.length} fixtures, zero live values\n`);
}

const command = process.argv[2];
try {
  if (command === 'test') verifyContract();
  else if (command === 'validate') validateSanitization();
  else throw new Error(`LIVE_COMMAND_UNKNOWN: ${command ?? '<missing>'}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
