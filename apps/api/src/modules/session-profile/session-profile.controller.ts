import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthError } from '../auth/auth.service.js';
import { extractAccessToken } from '../auth/extract-token.js';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import { SessionProfileService, type CurrentProfile } from './session-profile.service.js';

@ApiTags('session')
@ApiBearerAuth()
@Controller('api/v1/session')
export class SessionProfileController {
  constructor(private readonly profile: SessionProfileService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Return the current authenticated session profile' })
  @ApiOkResponse({ description: 'Allowlisted current merchant and owner profile' })
  async getProfile(@Req() request: Request): Promise<CurrentProfile> {
    const token = extractAccessToken(request);
    if (!token) throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    try {
      return await this.profile.getCurrentProfile(token);
    } catch (error) {
      if (error instanceof AuthError)
        throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
      throw error;
    }
  }
}
