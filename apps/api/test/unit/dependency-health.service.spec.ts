import { DependencyHealthService } from '../../src/modules/observability/dependency-health.service.js';

describe('DependencyHealthService', () => {
  test('starts with private unknown dependency status', () => {
    expect(new DependencyHealthService().getHealth()).toEqual({
      gateway: 'unknown',
      smtp: 'unknown',
      chromium: 'unknown'
    });
  });

  test('tracks dependency status without readiness semantics', () => {
    const service = new DependencyHealthService();
    service.setHealth({ gateway: 'down', smtp: 'up', chromium: 'down' });
    expect(service.getHealth()).toEqual({ gateway: 'down', smtp: 'up', chromium: 'down' });
  });

  test('returns a copy of dependency state', () => {
    const service = new DependencyHealthService();
    const health = service.getHealth();
    health.gateway = 'down';
    expect(service.getHealth().gateway).toBe('unknown');
  });

  test('supports all dependency states', () => {
    const service = new DependencyHealthService();
    service.setHealth({ gateway: 'up', smtp: 'unknown', chromium: 'down' });
    expect(service.getHealth().gateway).toBe('up');
    expect(service.getHealth().smtp).toBe('unknown');
    expect(service.getHealth().chromium).toBe('down');
  });
});
