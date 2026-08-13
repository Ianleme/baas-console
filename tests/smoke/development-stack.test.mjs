import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';

const projectName = `baas-smoke-${process.pid}`;
const composeFile = 'docker-compose.yml';
let composeConfig;
let environment;

function dockerCompose(args, options = {}) {
  return execFileSync(
    'docker',
    ['compose', '--file', composeFile, '--project-name', projectName, ...args],
    {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
      env: environment,
      stdio: options.stdio ?? 'pipe'
    }
  );
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('SMOKE_PORT_ALLOCATION_FAILED'));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

before(
  async () => {
    const [apiPort, webPort] = await Promise.all([
      freePort(),
      freePort()
    ]);
    environment = {
      ...process.env,
      API_PORT: String(apiPort),
      WEB_PORT: String(webPort),
      BAAS_DB_NAME: 'baas_smoke',
      BAAS_DB_USER: 'baas',
      BAAS_DB_PASSWORD: 'baas-smoke-password',
      BAAS_DB_ROOT_PASSWORD: 'baas-smoke-root-password'
    };
    composeConfig = JSON.parse(dockerCompose(['config', '--format', 'json']));
    dockerCompose(['up', '--build', '--wait', '--wait-timeout', '240'], { stdio: 'inherit' });
  },
  { timeout: 600_000 }
);

after(
  () => {
    if (environment) {
      dockerCompose(['down', '--volumes', '--remove-orphans'], { stdio: 'inherit' });
    }
  },
  { timeout: 120_000 }
);

test('defines the three development services plus a one-shot migration job', () => {
  assert.deepEqual(Object.keys(composeConfig.services).sort(), [
    'api',
    'migrate',
    'mysql',
    'web'
  ]);
  assert.equal(composeConfig.services.migrate.restart, 'no');
  assert.equal(
    composeConfig.services.api.depends_on.migrate.condition,
    'service_completed_successfully'
  );
});

test('defines container health checks for every long-running service', () => {
  for (const service of ['api', 'web', 'mysql']) {
    assert.ok(composeConfig.services[service].healthcheck?.test, `${service} healthcheck missing`);
  }
});

test('keeps MySQL private on the internal data network', () => {
  assert.equal(composeConfig.services.mysql.ports, undefined);
  assert.equal(composeConfig.networks.data.internal, true);
});

test('runs explicit migrations before API readiness', () => {
  const output = dockerCompose([
    'exec',
    '-T',
    'mysql',
    'mysql',
    `-u${environment.BAAS_DB_USER}`,
    `-p${environment.BAAS_DB_PASSWORD}`,
    environment.BAAS_DB_NAME,
    '--batch',
    '--skip-column-names',
    '-e',
    "SELECT COUNT(*) FROM migrations; SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('merchants','checkout_links','checkout_sessions','withdrawals','webhook_events');"
  ])
    .trim()
    .split(/\r?\n/u);
  assert.deepEqual(output, ['6', '5']);
});

test('reports API readiness only after database and schema checks succeed', async () => {
  const response = await fetch(`http://127.0.0.1:${environment.API_PORT}/health/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready' });
});

test('serves the built web application and its real health endpoint', async () => {
  const health = await fetch(`http://127.0.0.1:${environment.WEB_PORT}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const app = await fetch(`http://127.0.0.1:${environment.WEB_PORT}/`);
  assert.equal(app.status, 200);
  // Authorized correction: T004's approved app shell mounts at app-root.
  assert.match(await app.text(), /<div id="app-root"><\/div>/u);
});

test('forwards same-origin API requests to the API container', async () => {
  const response = await fetch(`http://127.0.0.1:${environment.WEB_PORT}/api/v1/__proxy_probe__`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json/u);
  const { requestId, ...problem } = await response.json();
  assert.match(requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(problem, {
    type: 'https://baas-console.invalid/problems/resource_not_found',
    title: 'Resource not found',
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    detail: 'The requested resource was not found.',
    instance: '/api/v1/__proxy_probe__'
  });
});

test('publishes the composed API surface and proxies login instead of returning a static 404', async () => {
  const document = await fetch(`http://127.0.0.1:${environment.API_PORT}/docs-json`).then(
    (response) => response.json()
  );
  assert.ok(Object.keys(document.paths).length >= 21);
  for (const path of [
    '/api/v1/auth/login',
    '/api/v1/checkout-links',
    '/api/v1/public/payments/pix',
    '/api/v1/public/payments/card/confirm',
    '/api/v1/wallet'
  ]) {
    assert.ok(document.paths[path], `Swagger path missing: ${path}`);
  }

  const login = await fetch(`http://127.0.0.1:${environment.WEB_PORT}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'missing@example.test',
      password: 'StrongPassword123',
      remember: false
    })
  });
  assert.equal(login.status, 401);
  assert.equal((await login.json()).code, 'INVALID_CREDENTIALS');
});

test('runs both application containers as non-root users', () => {
  for (const service of ['api', 'web']) {
    const uid = dockerCompose(['exec', '-T', service, 'id', '-u']).trim();
    assert.notEqual(uid, '0', `${service} must not run as root`);
  }
});
