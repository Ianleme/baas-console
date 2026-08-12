import { randomUUID } from 'node:crypto';

import type { DatabaseService } from '../../database/database.service.js';
import { WalletSnapshotEntity } from './entities/wallet-snapshot.entity.js';
import type { WalletSnapshotRecord, WalletSnapshotStore } from './wallet.service.js';

export class TypeOrmWalletSnapshotStore implements WalletSnapshotStore {
  constructor(private readonly database: DatabaseService) {}

  async latest(merchantId: string): Promise<WalletSnapshotRecord | undefined> {
    const entity = await this.database.getDataSource().manager.findOne(WalletSnapshotEntity, {
      where: { merchantId },
      order: { capturedAt: 'DESC', createdAt: 'DESC' }
    });
    return entity
      ? {
          balanceCents: entity.balanceCents,
          capturedAt: entity.capturedAt,
          sourceRequestId: entity.sourceRequestId
        }
      : undefined;
  }

  async save(merchantId: string, snapshot: WalletSnapshotRecord): Promise<void> {
    await this.database.getDataSource().manager.insert(WalletSnapshotEntity, {
      ...snapshot,
      id: randomUUID(),
      merchantId,
      availableCents: null
    });
  }
}
