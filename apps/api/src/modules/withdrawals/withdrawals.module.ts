import { Module } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { LeraBoxReconciliationClient } from '../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { WalletService } from '../wallet/wallet.service.js';
import { LeraBoxWithdrawalAdapter } from './adapters/lera-box-withdrawal.adapter.js';
import { BearerWithdrawalsPrincipal } from './runtime-withdrawals.providers.js';
import { WithdrawalsController } from './withdrawals.controller.js';
import { WithdrawalsService } from './withdrawals.service.js';

export const WITHDRAWAL_GATEWAY = Symbol('WITHDRAWAL_GATEWAY');

@Module({
  imports: [AuthModule, WalletModule],
  controllers: [WithdrawalsController],
  providers: [
    GatewayCredentialService,
    {
      provide: WITHDRAWAL_GATEWAY,
      useFactory: () =>
        new LeraBoxWithdrawalAdapter(new LeraBoxReconciliationClient(required('LERA_BOX_BASE_URL')))
    },
    {
      provide: WithdrawalsService,
      inject: [DatabaseService, WalletService, WITHDRAWAL_GATEWAY, GatewayCredentialService],
      useFactory: (
        database: DatabaseService,
        walletService: WalletService,
        gateway: LeraBoxWithdrawalAdapter,
        credentials: GatewayCredentialService
      ) => new WithdrawalsService(database, walletService, gateway, credentials)
    },
    { provide: 'WithdrawalsPrincipalProvider', useClass: BearerWithdrawalsPrincipal }
  ],
  exports: [WithdrawalsService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class WithdrawalsModule {}

function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'LERA_BOX_BASE_URL') return 'https://gateway.invalid';
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
