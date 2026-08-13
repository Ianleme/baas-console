import type { LeraBoxWalletClient } from '../../integrations/lera-box/wallet/lera-box-wallet.client.js';

export interface WalletSnapshotRecord {
  balanceCents: string;
  capturedAt: Date;
  sourceRequestId: string | null;
}

export interface WalletSnapshotStore {
  latest(merchantId: string): Promise<WalletSnapshotRecord | undefined>;
  save(merchantId: string, snapshot: WalletSnapshotRecord): Promise<void>;
}

export interface WalletView {
  balanceCents: string;
  capturedAt: string;
  stale: boolean;
}

export interface WalletAccessTokenProvider {
  accessToken(merchantId: string): Promise<string>;
}

export class WalletUnavailableError extends Error {
  readonly code = 'GATEWAY_UNAVAILABLE';

  constructor() {
    super('WALLET_UNAVAILABLE');
    this.name = 'WalletUnavailableError';
  }
}

export class WalletService {
  constructor(
    private readonly gateway: Pick<LeraBoxWalletClient, 'getWallet'>,
    private readonly store: WalletSnapshotStore,
    private readonly credentials: WalletAccessTokenProvider,
    private readonly staleAfterMs = 5 * 60_000,
    private readonly now: () => Date = () => new Date()
  ) {}

  async current(merchantId: string): Promise<WalletView> {
    const snapshot = await this.store.latest(merchantId);
    if (!snapshot) {
      try {
        return await this.refresh(merchantId);
      } catch {
        return {
          balanceCents: '0',
          capturedAt: this.now().toISOString(),
          stale: true
        };
      }
    }
    return this.view(
      snapshot,
      this.now().getTime() - snapshot.capturedAt.getTime() > this.staleAfterMs
    );
  }

  async refresh(merchantId: string): Promise<WalletView> {
    let snapshot: WalletSnapshotRecord;
    try {
      const accessToken = await this.credentials.accessToken(merchantId);
      snapshot = await this.gateway.getWallet(accessToken);
    } catch {
      const previous = await this.store.latest(merchantId);
      if (!previous) {
        return {
          balanceCents: '0',
          capturedAt: this.now().toISOString(),
          stale: true
        };
      }
      return this.view(previous, true);
    }
    await this.store.save(merchantId, snapshot);
    return this.view(snapshot, false);
  }

  private view(snapshot: WalletSnapshotRecord, stale: boolean): WalletView {
    return {
      balanceCents: snapshot.balanceCents,
      capturedAt: snapshot.capturedAt.toISOString(),
      stale
    };
  }
}
