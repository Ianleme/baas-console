import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Request } from 'express';

import type { GatewayWebhookEvent } from '../../../integrations/lera-box/webhooks/lera-box-webhooks.client.js';
import { ProblemException } from '../../../platform/errors/problem.exception.js';
import { AuthError, AuthService } from '../../auth/auth.service.js';
import { extractAccessToken } from '../../auth/extract-token.js';
import { GatewayCredentialService } from '../../gateway-accounts/gateway-credential.service.js';
import {
  WebhookConfigurationError,
  WebhookConfigurationService
} from './webhook-configuration.service.js';

class ConfigureWebhookDto {
  @IsIn(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL']) event!: GatewayWebhookEvent;
}

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('api/v1/webhooks')
export class WebhookConfigurationController {
  constructor(
    private readonly service: WebhookConfigurationService,
    private readonly auth: AuthService,
    private readonly credentials: GatewayCredentialService
  ) {}
  @Get()
  @ApiOkResponse({ description: 'Tenant-scoped webhook configurations without secrets' })
  async list(@Req() request: Request) {
    return this.service.list(this.principal(request).merchantId);
  }
  @Post()
  @ApiCreatedResponse({
    description: 'Gateway callback configured with a generated encrypted secret'
  })
  async configure(@Body() input: ConfigureWebhookDto, @Req() request: Request) {
    const principal = this.principal(request);
    try {
      return await this.service.configure({
        merchantId: principal.merchantId,
        actorUserId: principal.userId,
        requestId: requestId(request),
        accessToken: await this.credentials.accessToken(principal.merchantId),
        event: input.event
      });
    } catch (error) {
      throw problem(error);
    }
  }
  @Delete('configurations/:event')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Tenant-owned callback removed' })
  async remove(@Param('event') event: GatewayWebhookEvent, @Req() request: Request): Promise<void> {
    const principal = this.principal(request);
    try {
      await this.service.remove({
        merchantId: principal.merchantId,
        actorUserId: principal.userId,
        requestId: requestId(request),
        accessToken: await this.credentials.accessToken(principal.merchantId),
        event
      });
    } catch (error) {
      throw problem(error);
    }
  }
  private principal(request: Request) {
    try {
      const token = extractAccessToken(request);
      if (!token) throw new AuthError('AUTH_REQUIRED');
      return this.auth.verifyAccessToken(token);
    } catch {
      throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
  }
}
function requestId(request: Request): string {
  const value = request.headers['x-request-id'];
  return typeof value === 'string' && /^[0-9a-f-]{36}$/iu.test(value) ? value : crypto.randomUUID();
}
function problem(error: unknown): ProblemException {
  if (error instanceof ProblemException) return error;
  if (error instanceof WebhookConfigurationError)
    return new ProblemException(
      error.code,
      error.code === 'WEBHOOK_NOT_FOUND' ? 404 : 409,
      'Webhook configuration request was rejected.'
    );
  if (
    error instanceof Error &&
    (error.message.includes('GATEWAY') || error.message.includes('LERA_BOX'))
  )
    return new ProblemException('GATEWAY_UNAVAILABLE', 503, 'The gateway is unavailable.');
  throw error;
}
