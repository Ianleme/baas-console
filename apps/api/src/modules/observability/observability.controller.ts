import { Controller, Get } from '@nestjs/common';

import { DependencyHealthService } from './dependency-health.service.js';

@Controller('health')
export class ObservabilityController {
  constructor(private readonly dependencies: DependencyHealthService) {}

  @Get('dependencies')
  dependenciesHealth() {
    return this.dependencies.getHealth();
  }
}
