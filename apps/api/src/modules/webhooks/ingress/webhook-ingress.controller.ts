import { Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProblemException } from '../../../platform/errors/problem.exception.js';
import { WebhookIngressError, WebhookIngressService } from './webhook-ingress.service.js';

@ApiTags('webhooks')
@Controller('api/v1/webhooks')
export class WebhookIngressController {
  constructor(private readonly ingress: WebhookIngressService) {}

  @Post(':publicEndpointId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a raw HMAC-authenticated gateway event' })
  @ApiOkResponse({ description: 'Event durably persisted before acknowledgement' })
  async receive(
    @Param('publicEndpointId') publicEndpointId: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-event') eventHeader?: string
  ): Promise<{ status: 'RECEIVED' | 'UNPROCESSABLE' }> {
    if (!request.rawBody) throw problem(new WebhookIngressError('WEBHOOK_RAW_BODY_REQUIRED', 401));
    try {
      return await this.ingress.receive({
        publicEndpointId,
        rawBody: request.rawBody,
        signature,
        eventHeader
      });
    } catch (error) {
      if (error instanceof WebhookIngressError) throw problem(error);
      throw error;
    }
  }
}

function problem(error: WebhookIngressError): ProblemException {
  return new ProblemException(error.code, error.httpStatus, 'The webhook could not be accepted.');
}
