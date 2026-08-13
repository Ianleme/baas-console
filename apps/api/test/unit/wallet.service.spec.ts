/* eslint-disable @typescript-eslint/unbound-method -- Jest mocks are inspected without invocation. */
import {
  WalletService,
  type WalletSnapshotStore
} from '../../src/modules/wallet/wallet.service.js';

const capturedAt = new Date('2026-08-12T12:00:00.000Z');
const snapshot = { balanceCents: '2485072', capturedAt, sourceRequestId: 'wallet-request-1' };

function setup(now = new Date('2026-08-12T12:04:00.000Z')) {
  const gateway = { getWallet: jest.fn().mockResolvedValue(snapshot) };
  const store: jest.Mocked<WalletSnapshotStore> = {
    latest: jest.fn().mockResolvedValue(snapshot),
    save: jest.fn().mockResolvedValue(undefined)
  };
  const credentials = { accessToken: jest.fn().mockResolvedValue('server-token') };
  return {
    gateway,
    store,
    credentials,
    service: new WalletService(gateway, store, credentials, 5 * 60_000, () => now)
  };
}

describe('WalletService', () => {
  test('returns the tenant latest snapshot with exact cents and UTC timestamp', async () => {
    const { service, store } = setup();
    await expect(service.current('merchant-a')).resolves.toEqual({
      balanceCents: '2485072',
      capturedAt: '2026-08-12T12:00:00.000Z',
      stale: false
    });
    expect(store.latest).toHaveBeenCalledWith('merchant-a');
  });

  test('marks a snapshot older than the freshness window stale', async () => {
    const { service } = setup(new Date('2026-08-12T12:05:00.001Z'));
    await expect(service.current('merchant-a')).resolves.toMatchObject({ stale: true });
  });

  test('keeps a snapshot at the exact freshness boundary current', async () => {
    const { service } = setup(new Date('2026-08-12T12:05:00.000Z'));
    await expect(service.current('merchant-a')).resolves.toMatchObject({ stale: false });
  });

  test('fetches from gateway or returns fallback when no local snapshot exists', async () => {
    const { service, store } = setup();
    store.latest.mockResolvedValue(undefined);
    await expect(service.current('merchant-a')).resolves.toEqual({
      balanceCents: '2485072',
      capturedAt: '2026-08-12T12:00:00.000Z',
      stale: false
    });
  });

  test('refreshes with the server-side credential and persists under the tenant', async () => {
    const { service, gateway, store, credentials } = setup();
    await expect(service.refresh('merchant-a')).resolves.toEqual({
      balanceCents: '2485072',
      capturedAt: '2026-08-12T12:00:00.000Z',
      stale: false
    });
    expect(credentials.accessToken).toHaveBeenCalledWith('merchant-a');
    expect(gateway.getWallet).toHaveBeenCalledWith('server-token');
    expect(store.save).toHaveBeenCalledWith('merchant-a', snapshot);
  });

  test('preserves the last tenant snapshot and marks it stale when the gateway fails', async () => {
    const { service, gateway, store } = setup();
    gateway.getWallet.mockRejectedValue(new Error('LERA_BOX_TIMEOUT'));
    await expect(service.refresh('merchant-a')).resolves.toEqual({
      balanceCents: '2485072',
      capturedAt: '2026-08-12T12:00:00.000Z',
      stale: true
    });
    expect(store.latest).toHaveBeenCalledWith('merchant-a');
    expect(store.save).not.toHaveBeenCalled();
  });

  test('returns fallback stale zero view when gateway fails before any snapshot exists', async () => {
    const { service, gateway, store } = setup();
    gateway.getWallet.mockRejectedValue(new Error('LERA_BOX_TIMEOUT'));
    store.latest.mockResolvedValue(undefined);
    await expect(service.refresh('merchant-a')).resolves.toMatchObject({
      balanceCents: '0',
      stale: true
    });
  });

  test('does not disguise persistence failure as a stale gateway read', async () => {
    const { service, store } = setup();
    store.save.mockRejectedValue(new Error('DATABASE_WRITE_FAILED'));
    await expect(service.refresh('merchant-a')).rejects.toThrow('DATABASE_WRITE_FAILED');
    expect(store.latest).not.toHaveBeenCalled();
  });
});
