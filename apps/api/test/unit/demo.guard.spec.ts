import type { ExecutionContext } from '@nestjs/common';
import { DemoReadOnlyGuard } from '../../src/modules/demo/demo.guard.js';
import { DemoService } from '../../src/modules/demo/demo.service.js';

function context(method: string, path: string, authorization?: string): ExecutionContext {
  const request = {
    method,
    path,
    header: (name: string) => (name === 'authorization' ? authorization : undefined)
  } as never;
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe('DemoReadOnlyGuard', () => {
  const service = new DemoService();
  const guard = new DemoReadOnlyGuard(service);
  beforeEach(() => {
    process.env.DEMO_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.DEMO_ENABLED;
  });

  test.each(['GET', 'HEAD', 'OPTIONS'])('allows %s demo reads', (method) => {
    const token = service.issueSession().accessToken;
    expect(guard.canActivate(context(method, '/api/v1/wallet', `Bearer ${token}`))).toBe(true);
  });

  test('allows demo session issuance', () => {
    const token = service.issueSession().accessToken;
    expect(guard.canActivate(context('POST', '/api/v1/demo/session', `Bearer ${token}`))).toBe(
      true
    );
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('denies %s mutations', (method) => {
    const token = service.issueSession().accessToken;
    try {
      guard.canActivate(context(method, '/api/v1/payments', `Bearer ${token}`));
      throw new Error('UNREACHABLE');
    } catch (err: unknown) {
      expect(err).toMatchObject({ code: 'DEMO_READ_ONLY', status: 403 });
    }
  });

  test('does not classify a normal request as demo', () => {
    expect(guard.canActivate(context('POST', '/api/v1/payments'))).toBe(true);
  });

  test('does not classify an invalid bearer as demo', () => {
    expect(guard.canActivate(context('POST', '/api/v1/payments', 'Bearer invalid'))).toBe(true);
  });

  test('rejects a demo token on a nested mutation', () => {
    const token = service.issueSession().accessToken;
    try {
      guard.canActivate(context('POST', '/api/v1/withdrawals/1/retry', `Bearer ${token}`));
      throw new Error('UNREACHABLE');
    } catch (err: unknown) {
      expect(err).toMatchObject({ code: 'DEMO_READ_ONLY', status: 403 });
    }
  });

  test('allows a demo GET regardless of resource path', () => {
    const token = service.issueSession().accessToken;
    expect(guard.canActivate(context('GET', '/api/v1/internal/secret', `Bearer ${token}`))).toBe(
      true
    );
  });

  test('accepts only the exact session issuance path as a mutation exception', () => {
    const token = service.issueSession().accessToken;
    try {
      guard.canActivate(context('POST', '/api/v1/demo/session/other', `Bearer ${token}`));
      throw new Error('UNREACHABLE');
    } catch (err: unknown) {
      expect(err).toMatchObject({ code: 'DEMO_READ_ONLY', status: 403 });
    }
  });

  test('attaches the fixed demo principal to the request', () => {
    const token = service.issueSession().accessToken;
    const request = {
      method: 'GET',
      path: '/api/v1/dashboard',
      header: () => `Bearer ${token}`
    } as never;
    guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
    expect((request as { demoPrincipal?: { merchantId: string } }).demoPrincipal?.merchantId).toBe(
      '00000000-0000-4000-8000-000000000043'
    );
  });
});
