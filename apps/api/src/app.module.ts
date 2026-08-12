import { MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';

import { DatabaseService } from './database/database.service.js';
import { HealthController } from './platform/health/health.controller.js';
import { HealthProbe } from './platform/health/health.probe.js';
import { HttpLoggingMiddleware } from './platform/logging/http-logging.middleware.js';
import { platformLoggerProvider } from './platform/logging/platform-logger.js';
import { RequestContextMiddleware } from './platform/request-context/request-context.middleware.js';

@Module({
  controllers: [HealthController],
  providers: [DatabaseService, HealthProbe, platformLoggerProvider]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, HttpLoggingMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
