import { Module } from '@nestjs/common';

import { DependencyHealthService } from './dependency-health.service.js';
import { MetricsService } from './metrics.service.js';
import { ObservabilityController } from './observability.controller.js';

@Module({
  controllers: [ObservabilityController],
  providers: [MetricsService, DependencyHealthService],
  exports: [MetricsService, DependencyHealthService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ObservabilityModule {}
