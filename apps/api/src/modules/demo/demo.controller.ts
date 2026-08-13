import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { DemoService } from './demo.service.js';

@ApiTags('demo')
@Controller('api/v1/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('session')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a short-lived read-only demo session' })
  session(): ReturnType<DemoService['issueSession']> {
    return this.demo.issueSession();
  }
}
