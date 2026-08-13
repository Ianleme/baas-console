import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthError, AuthService } from '../auth/auth.service.js';
import { extractAccessToken } from '../auth/extract-token.js';
import { GatewayOnboardingError, GatewayOnboardingService } from './gateway-onboarding.service.js';

class ConnectGatewayDto {
  @IsString() @Length(3, 32) document!: string;
  @IsString() @Length(1, 128) password!: string;
}

@ApiTags('gateway-account')
@ApiBearerAuth()
@Controller('api/v1/gateway-account')
export class GatewayAccountController {
  constructor(
    private readonly onboarding: GatewayOnboardingService,
    private readonly auth: AuthService
  ) {}
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and connect the current merchant gateway account' })
  @ApiOkResponse({ description: 'Gateway profile verified and credentials encrypted' })
  async connect(
    @Req() request: Request,
    @Body() input: ConnectGatewayDto
  ): Promise<{ status: 'ACTIVE' }> {
    try {
      const token = extractAccessToken(request);
      if (!token) throw new AuthError('AUTH_REQUIRED');
      const principal = this.auth.verifyAccessToken(token);
      await this.onboarding.connect(principal.merchantId, input.document, input.password);
      return { status: 'ACTIVE' };
    } catch (error) {
      if (error instanceof AuthError)
        throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
      if (error instanceof GatewayOnboardingError)
        throw new ProblemException(error.code, 409, 'Gateway connection was rejected.');
      throw error;
    }
  }
}
