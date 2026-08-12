import { Module } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { LeraBoxReconciliationClient } from '../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import { LeraBoxStatementAdapter } from './adapters/lera-box-statement.adapter.js';
import { BearerTransactionsPrincipal } from './runtime-transactions.providers.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

export const STATEMENT_GATEWAY = Symbol('STATEMENT_GATEWAY');

@Module({
  imports: [AuthModule],
  controllers: [TransactionsController],
  providers: [
    GatewayCredentialService,
    {
      provide: STATEMENT_GATEWAY,
      useFactory: () =>
        new LeraBoxStatementAdapter(new LeraBoxReconciliationClient(required('LERA_BOX_BASE_URL')))
    },
    {
      provide: TransactionsService,
      inject: [DatabaseService, STATEMENT_GATEWAY, GatewayCredentialService],
      useFactory: (
        database: DatabaseService,
        gateway: LeraBoxStatementAdapter,
        credentials: GatewayCredentialService
      ) => new TransactionsService(database.getDataSource(), gateway, credentials)
    },
    { provide: 'TransactionsPrincipalProvider', useClass: BearerTransactionsPrincipal }
  ],
  exports: [TransactionsService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest requires a decorated runtime module.
export class TransactionsModule {}

function required(name: string): string {
  const value = process.env[name];
  if (process.env.JEST_WORKER_ID && name === 'LERA_BOX_BASE_URL') return 'https://gateway.invalid';
  if (!value) throw new Error(`CONFIGURATION_MISSING: ${name}`);
  return value;
}
