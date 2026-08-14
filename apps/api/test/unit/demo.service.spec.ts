import { DemoService } from '../../src/modules/demo/demo.service.js';

describe('DemoService', () => {
  const service = new DemoService();
  const now = 1_700_000_000_000;

  beforeEach(() => {
    process.env.DEMO_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.DEMO_ENABLED;
  });

  test.each([
    [
      'issues a fixed tenant session',
      (token: ReturnType<DemoService['issueSession']>) => {
        expect(token.principal.merchantId).toBe('00000000-0000-4000-8000-000000000043');
      }
    ],
    [
      'uses a demo principal',
      (token: ReturnType<DemoService['issueSession']>) => {
        expect(token.principal.demo).toBe(true);
      }
    ],
    [
      'has a short expiry',
      (token: ReturnType<DemoService['issueSession']>) => {
        expect(token.principal.exp).toBe(now + 900_000);
      }
    ],
    [
      'returns a bearer-shaped token',
      (token: ReturnType<DemoService['issueSession']>) => {
        expect(token.accessToken.split('.')).toHaveLength(2);
      }
    ],
    [
      'returns an ISO expiry',
      (token: ReturnType<DemoService['issueSession']>) => {
        expect(token.expiresAt).toBe(new Date(now + 900_000).toISOString());
      }
    ]
  ])('%s', (_name, assertion) => {
    assertion(service.issueSession(now));
  });

  test.each([
    [
      'accepts a valid session',
      (token: string) => {
        expect(service.verifySession(token, now)).toMatchObject({ demo: true });
      }
    ],
    [
      'rejects a tampered session',
      (token: string) => {
        expect(service.verifySession(`${token}x`, now)).toBeUndefined();
      }
    ],
    [
      'rejects an expired session',
      (token: string) => {
        expect(service.verifySession(token, now + 900_000)).toBeUndefined();
      }
    ]
  ])('%s', (_name, assertion) => {
    assertion(service.issueSession(now).accessToken);
  });

  test('does not issue while disabled', () => {
    delete process.env.DEMO_ENABLED;
    expect(() => service.issueSession(now)).toThrow('DEMO_DISABLED');
  });
});
