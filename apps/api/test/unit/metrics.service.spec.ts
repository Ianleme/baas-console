import { MetricsService } from '../../src/modules/observability/metrics.service.js';

describe('MetricsService', () => {
  test('aggregates only the fixed low-cardinality label set', () => {
    const service = new MetricsService();
    service.increment('http_requests_total', {
      method: 'GET',
      route: '/health/live',
      status: '2xx'
    });
    service.increment('http_requests_total', {
      method: 'GET',
      route: '/health/live',
      status: '2xx'
    });
    expect(service.snapshot().get('http_requests_total|GET|/health/live|2xx')).toBe(2);
    expect([...service.snapshot().keys()].join('|')).not.toContain('merchant');
  });

  test('does not expose mutable internal state', () => {
    const service = new MetricsService();
    const snapshot = service.snapshot();
    snapshot.set('forged', 99);
    expect(service.snapshot().has('forged')).toBe(false);
  });

  test('separates status classes', () => {
    const service = new MetricsService();
    service.increment('http_requests_total', {
      method: 'GET',
      route: '/health/live',
      status: '2xx'
    });
    service.increment('http_requests_total', {
      method: 'GET',
      route: '/health/live',
      status: '5xx'
    });
    expect(service.snapshot().get('http_requests_total|GET|/health/live|2xx')).toBe(1);
    expect(service.snapshot().get('http_requests_total|GET|/health/live|5xx')).toBe(1);
  });

  test('separates normalized routes', () => {
    const service = new MetricsService();
    service.increment('http_requests_total', { method: 'GET', route: '/links/:id', status: '2xx' });
    expect(service.snapshot().has('http_requests_total|GET|/links/:id|2xx')).toBe(true);
    expect([...service.snapshot().keys()].join('')).not.toContain('secret-id');
  });

  test('separates HTTP methods', () => {
    const service = new MetricsService();
    service.increment('http_requests_total', {
      method: 'GET',
      route: '/health/live',
      status: '2xx'
    });
    service.increment('http_requests_total', {
      method: 'POST',
      route: '/health/live',
      status: '2xx'
    });
    expect(service.snapshot().size).toBe(2);
  });

  test('returns a fresh snapshot each time', () => {
    const service = new MetricsService();
    const first = service.snapshot();
    service.increment('x', { method: 'GET', route: '/', status: '2xx' });
    expect(first.has('x|GET|/|2xx')).toBe(false);
  });
});
