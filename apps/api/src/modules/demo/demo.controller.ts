import { Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { DemoService } from './demo.service.js';

@ApiTags('demo')
@Controller('api/v1/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('session')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a short-lived read-only demo session' })
  session(@Ip() ip: string): ReturnType<DemoService['issueSession']> {
    return this.demo.issueSession(Date.now(), ip);
  }

  @Get('view')
  view(): { merchant: { displayName: string }; balanceCents: string; mode: 'READ_ONLY' } {
    return {
      merchant: { displayName: 'Demo Aurora Store' },
      balanceCents: '125000',
      mode: 'READ_ONLY'
    };
  }
}
