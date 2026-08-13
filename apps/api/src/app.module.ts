import { MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { HealthController } from './platform/health/health.controller.js';
import { HealthProbe } from './platform/health/health.probe.js';
import { HttpLoggingMiddleware } from './platform/logging/http-logging.middleware.js';
import { platformLoggerProvider } from './platform/logging/platform-logger.js';
import { RequestContextMiddleware } from './platform/request-context/request-context.middleware.js';

import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module.js';
import { SessionProfileModule } from './modules/session-profile/session-profile.module.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { ObservabilityModule } from './modules/observability/observability.module.js';
import { AuditModule } from './modules/audit/audit.module.js';

@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    WebhooksModule,
    WalletModule,
    TransactionsModule,
    WithdrawalsModule,
    SessionProfileModule,
    DemoModule,
    ObservabilityModule,
    AuditModule
  ],
  controllers: [HealthController],
  providers: [HealthProbe, platformLoggerProvider]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, HttpLoggingMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
