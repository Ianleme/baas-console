import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type StubScenario = 'success' | 'validation-error' | 'timeout' | 'disconnect';

export interface ExpectedRequest {
  method: string;
  path: string;
  body?: JsonValue;
}

interface StubOptions {
  expectedRequests?: ExpectedRequest[];
  timeoutDelayMs?: number;
}

const responses = JSON.parse(
  readFileSync(new URL('../../fixtures/lera-box/responses.json', import.meta.url), 'utf8')
) as Record<string, { status: number; body?: JsonValue }>;

function responseFixture(name: string): { status: number; body?: JsonValue } {
  const fixture = responses[name];
  if (!fixture) throw new Error(`LERA_BOX_FIXTURE_MISSING: ${name}`);
  return fixture;
}

function stableJson(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}

function fixtureFor(method: string, path: string): { status: number; body?: JsonValue } {
  if (method === 'POST' && path === '/api/auth/login') return responseFixture('login');
  if (method === 'GET' && path === '/api/users/me') return responseFixture('profile');
  if (method === 'GET' && path === '/api/fees') return responseFixture('fees');
  if (method === 'GET' && path === '/api/wallet') return responseFixture('wallet');
  if (method === 'GET' && path === '/api/wallet/transactions') return responseFixture('statement');
  if (method === 'POST' && path === '/api/payments/pix') return responseFixture('pixDenied');
  if (method === 'POST' && path === '/api/payments/card') return responseFixture('cardApproved');
  if (method === 'POST' && path === '/api/withdrawals')
    return responseFixture('withdrawalApproved');
  if (method === 'GET' && path.startsWith('/api/payments/')) return responseFixture('cardApproved');
  if (method === 'GET' && path.startsWith('/api/withdrawals/'))
    return responseFixture('withdrawalApproved');
  if (method === 'POST' && path === '/api/webhooks') {
    return {
      status: 201,
      body: {
        id: 'fixture-webhook-id',
        event: 'PAYMENT_PIX',
        url: 'https://callback.invalid/hooks/payment-pix',
        hasSecret: true,
        active: true,
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z'
      }
    };
  }
  if (method === 'GET' && path === '/api/webhooks') return { status: 200, body: [] };
  if (method === 'DELETE' && path.startsWith('/api/webhooks/')) {
    return { status: 200, body: { deleted: true } };
  }
  return {
    status: 404,
    body: { statusCode: 404, error: 'Not Found', message: 'Fixture not found' }
  };
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class LeraBoxStub {
  readonly #expectedRequests: ExpectedRequest[];
  readonly #timeoutDelayMs: number;
  #matchedRequests = 0;
  #server: Server | undefined;
  #baseUrl: string | undefined;

  constructor(options: StubOptions = {}) {
    this.#expectedRequests = [...(options.expectedRequests ?? [])];
    this.#timeoutDelayMs = options.timeoutDelayMs ?? 100;
  }

  get baseUrl(): string {
    if (!this.#baseUrl) throw new Error('LERA_BOX_STUB_NOT_STARTED');
    return this.#baseUrl;
  }

  async start(): Promise<void> {
    if (this.#server) throw new Error('LERA_BOX_STUB_ALREADY_STARTED');
    const server = createServer((request, response) => void this.#handle(request, response));
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('LERA_BOX_STUB_ADDRESS_UNAVAILABLE');
    this.#baseUrl = `http://127.0.0.1:${String(address.port)}`;
  }

  async stop(): Promise<void> {
    if (!this.#server) return;
    const server = this.#server;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.#server = undefined;
    this.#baseUrl = undefined;
  }

  assertSatisfied(): void {
    if (this.#matchedRequests !== this.#expectedRequests.length) {
      throw new Error(
        `LERA_BOX_STUB_EXPECTATION_UNSATISFIED: expected ${String(this.#expectedRequests.length)}, matched ${String(this.#matchedRequests)}`
      );
    }
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://stub.local');
    const method = request.method ?? 'GET';
    const rawBody = await readBody(request);
    const scenario = (request.headers['x-lera-box-scenario'] ?? 'success') as StubScenario;

    if (scenario === 'disconnect') {
      request.socket.destroy();
      return;
    }
    if (scenario === 'timeout') {
      setTimeout(() => response.destroy(), this.#timeoutDelayMs);
      return;
    }

    const expected = this.#expectedRequests[this.#matchedRequests];
    if (expected) {
      let parsedBody: JsonValue | undefined;
      if (rawBody.length > 0) parsedBody = JSON.parse(rawBody.toString('utf8')) as JsonValue;
      const matches =
        expected.method === method &&
        expected.path === url.pathname &&
        stableJson(expected.body) === stableJson(parsedBody);
      if (!matches) {
        this.#send(response, 422, {
          statusCode: 422,
          error: 'Fixture Mismatch',
          message: 'Request did not match fixture'
        });
        return;
      }
      this.#matchedRequests += 1;
    }

    const fixture =
      scenario === 'validation-error'
        ? responseFixture('validationError')
        : fixtureFor(method, url.pathname);
    this.#send(response, fixture.status, fixture.body ?? null);
  }

  #send(response: ServerResponse, status: number, body: JsonValue): void {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
  }
}

export function signWebhook(
  payload: JsonValue,
  secret: string
): {
  rawBody: Buffer;
  headers: Readonly<Record<string, string>>;
} {
  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
  const event = (payload as { event?: JsonValue }).event;
  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'x-lera-box-event': typeof event === 'string' ? event : '',
      'x-lera-box-signature': createHmac('sha256', secret).update(rawBody).digest('hex')
    }
  };
}
