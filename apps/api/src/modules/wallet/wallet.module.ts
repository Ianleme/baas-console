import { Module } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { LeraBoxWalletClient } from '../../integrations/lera-box/wallet/lera-box-wallet.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import { BearerWalletPrincipal } from './runtime-wallet.providers.js';
import { TypeOrmWalletSnapshotStore } from './typeorm-wallet-snapshot.store.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

export const GATEWAY_WALLET = Symbol('GATEWAY_WALLET');

@Module({
  imports: [AuthModule],
  controllers: [WalletController],
  providers: [
    GatewayCredentialService,
    {
      provide: TypeOrmWalletSnapshotStore,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new TypeOrmWalletSnapshotStore(database)
    },
    {
      provide: GATEWAY_WALLET,
      useFactory: () => new LeraBoxWalletClient(required('LERA_BOX_BASE_URL'))
    },
    {
      provide: WalletService,
      inject: [GATEWAY_WALLET, TypeOrmWalletSnapshotStore, GatewayCredentialService],
      useFactory: (
        gateway: LeraBoxWalletClient,
        store: TypeOrmWalletSnapshotStore,
        credentials: GatewayCredentialService
      ) => new WalletService(gateway, store, credentials)
    },
    { provide: 'WalletPrincipalProvider', useClass: BearerWalletPrincipal }
  ],
  exports: [WalletService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class WalletModule {}

function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'LERA_BOX_BASE_URL') return 'https://gateway.invalid';
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
