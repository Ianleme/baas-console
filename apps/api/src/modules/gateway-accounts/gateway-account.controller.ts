import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthError, AuthService } from '../auth/auth.service.js';
import { extractAccessToken } from '../auth/extract-token.js';
import { GatewayOnboardingError, GatewayOnboardingService } from './gateway-onboarding.service.js';

class ConnectGatewayDto {
  @IsString() @Length(3, 32) document!: string;
  @IsString() @Length(1, 128) password!: string;
}

class RegisterGatewayDto {
  @IsIn(['PF', 'PJ']) personType!: 'PF' | 'PJ';
  @IsString() @Length(2, 255) name!: string;
  @IsOptional() @IsString() @Length(2, 120) tradingName?: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(8, 20) phone!: string;
  @IsString() @Length(3, 32) document!: string;
  @IsString() @Length(8, 12) zipCode!: string;
  @IsString() @Length(2, 255) address!: string;
  @IsString() @Length(1, 20) number!: string;
  @IsOptional() @IsString() @Length(1, 120) complement?: string;
  @IsString() @Length(2, 120) neighborhood!: string;
  @IsString() @Length(2, 120) city!: string;
  @IsString() @Length(2, 2) state!: string;
}

@ApiTags('gateway-account')
@ApiBearerAuth()
@Controller('api/v1/gateway-account')
export class GatewayAccountController {
  constructor(
    private readonly onboarding: GatewayOnboardingService,
    private readonly auth: AuthService
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or retry the current merchant at the gateway' })
  async register(
    @Req() request: Request,
    @Body() input: RegisterGatewayDto
  ): Promise<{ status: string; errorCode: string | null }> {
    try {
      const token = extractAccessToken(request);
      if (!token) throw new AuthError('AUTH_REQUIRED');
      const principal = this.auth.verifyAccessToken(token);
      const result = await this.onboarding.retryRegistration(principal.merchantId, input);
      return { status: result.status, errorCode: result.lastErrorCode ?? null };
    } catch (error) {
      if (error instanceof AuthError)
        throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
      if (error instanceof GatewayOnboardingError)
        throw new ProblemException(error.code, 409, 'Gateway registration was rejected.');
      throw error;
    }
  }

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
