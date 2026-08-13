import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { EmailOutboxService, type EmailDeliveryView } from './email-outbox.service.js';

export interface EmailDeliveriesPrincipalProvider {
  current(): { merchantId: string };
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('api/v1/notifications/email-deliveries')
export class EmailDeliveriesController {
  constructor(
    private readonly service: EmailOutboxService,
    @Inject('TransactionsPrincipalProvider')
    private readonly principal: EmailDeliveriesPrincipalProvider
  ) {}

  @Get()
  @ApiOperation({ summary: 'List outbox email deliveries for merchant' })
  async list(
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ): Promise<{ items: EmailDeliveryView[]; total: number }> {
    const merchantId = this.principal.current().merchantId;
    const options: {
      status?: string | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    } = {};
    if (status !== undefined) options.status = status;
    if (limit !== undefined) options.limit = limit;
    if (offset !== undefined) options.offset = offset;
    return this.service.listDeliveries(merchantId, options);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed or dead-letter outbox email delivery' })
  async retry(@Param('id') id: string): Promise<EmailDeliveryView> {
    const merchantId = this.principal.current().merchantId;
    try {
      return await this.service.retryDeadLetter(merchantId, id);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? '';
      if (msg === 'DELIVERY_NOT_FOUND') {
        throw new ProblemException('DELIVERY_NOT_FOUND', 404, 'Delivery record not found.');
      }
      if (msg === 'DELIVERY_NOT_RETRYABLE') {
        throw new ProblemException(
          'DELIVERY_NOT_RETRYABLE',
          400,
          'Delivery is not in dead-letter or failed state.'
        );
      }
      throw err;
    }
  }
}
