import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { SessionProfileController } from './session-profile.controller.js';
import { SessionProfileService } from './session-profile.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SessionProfileController],
  providers: [SessionProfileService]
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SessionProfileModule {}
