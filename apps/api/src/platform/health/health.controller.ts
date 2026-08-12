import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { ProblemException } from '../errors/problem.exception.js';
import { HealthProbe } from './health.probe.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthProbe: HealthProbe) {}

  @Get('live')
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ schema: { example: { status: 'ready' } } })
  @ApiServiceUnavailableResponse({ description: 'Database or schema is not ready' })
  async ready(): Promise<{ status: 'ready' }> {
    const failureCode = await this.healthProbe.checkReadiness();
    if (failureCode) {
      throw new ProblemException(
        failureCode,
        HttpStatus.SERVICE_UNAVAILABLE,
        'The database schema is not ready.'
      );
    }
    return { status: 'ready' };
  }
}
