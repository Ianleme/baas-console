import {
  AuditEventService,
  isAllowedAuditAction
} from '../../src/modules/audit/audit-event.service.js';

describe('AuditEventService', () => {
  test.each(['LOGIN', 'PAYMENT_SUBMITTED', 'WITHDRAWAL_SUBMITTED', 'RECEIPT_ISSUED'])(
    '%s is allowlisted',
    (action) => {
      expect(isAllowedAuditAction(action)).toBe(true);
    }
  );

  test('rejects unallowlisted event names', async () => {
    const repository = { insert: jest.fn() };
    const service = new AuditEventService({ getRepository: () => repository } as never);
    await expect(
      service.record({
        merchantId: 'm',
        actorType: 'SYSTEM',
        action: 'PASSWORD_VALUE',
        targetType: 'x',
        requestId: 'r'
      })
    ).rejects.toThrow('AUDIT_ACTION_NOT_ALLOWED');
    expect(repository.insert).not.toHaveBeenCalled();
  });

  test('persists sanitized allowlisted metadata', async () => {
    const repository = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new AuditEventService({ getRepository: () => repository } as never);
    await service.record({
      merchantId: 'm',
      actorType: 'USER',
      action: 'LOGIN',
      targetType: 'session',
      requestId: 'r',
      metadata: { outcome: 'success' }
    });
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        metadataJson: { outcome: 'success' },
        merchantId: 'm'
      })
    );
  });

  test('persists actor and target fields', async () => {
    const repository = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new AuditEventService({ getRepository: () => repository } as never);
    await service.record({
      merchantId: 'm',
      actorUserId: 'u',
      actorType: 'USER',
      action: 'PAYMENT_SUBMITTED',
      targetType: 'payment',
      targetPublicId: 'public-1',
      requestId: 'r'
    });
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u',
        targetType: 'payment',
        targetPublicId: 'public-1'
      })
    );
  });

  test('allows demo audit actor', async () => {
    const repository = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new AuditEventService({ getRepository: () => repository } as never);
    await service.record({
      merchantId: 'demo',
      actorType: 'DEMO',
      action: 'DEMO_SESSION_ISSUED',
      targetType: 'session',
      requestId: 'r'
    });
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'DEMO', action: 'DEMO_SESSION_ISSUED' })
    );
  });

  test('does not persist disallowed metadata-bearing actions', async () => {
    const repository = { insert: jest.fn() };
    const service = new AuditEventService({ getRepository: () => repository } as never);
    await expect(
      service.record({
        merchantId: 'm',
        actorType: 'SYSTEM',
        action: 'TOKEN_EXPOSED',
        targetType: 'x',
        requestId: 'r',
        metadata: { token: 'secret' }
      })
    ).rejects.toThrow('AUDIT_ACTION_NOT_ALLOWED');
    expect(repository.insert).not.toHaveBeenCalled();
  });

  test('returns true only for allowlisted actions', () => {
    expect(isAllowedAuditAction('LOGIN')).toBe(true);
    expect(isAllowedAuditAction('UNKNOWN_OPERATION')).toBe(false);
  });
});
