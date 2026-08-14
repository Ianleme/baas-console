import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { DemoController } from './demo.controller.js';
import { DemoReadOnlyGuard } from './demo.guard.js';
import { DemoService } from './demo.service.js';

@Module({
  controllers: [DemoController],
  providers: [DemoService, { provide: APP_GUARD, useClass: DemoReadOnlyGuard }],
  exports: [DemoService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DemoModule {}
