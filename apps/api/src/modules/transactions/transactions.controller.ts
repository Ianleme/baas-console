import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { renderReceiptHtml } from '@baas/receipt-template';
import type { Response } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { ListTransactionsDto } from './dto/list-transactions.dto.js';
import {
  TransactionsService,
  type TransactionItemView,
  type TransactionStatementView
} from './transactions.service.js';

export interface TransactionsPrincipalProvider {
  current(): { merchantId: string };
}

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('api/v1/transactions')
export class TransactionsController {
  constructor(
    private readonly service: TransactionsService,
    @Inject('TransactionsPrincipalProvider')
    private readonly principal: TransactionsPrincipalProvider
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Consolidated transaction statement for tenant' })
  list(@Query() query: ListTransactionsDto): Promise<TransactionStatementView> {
    return this.service.list(this.principal.current().merchantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction detail by ID' })
  async getDetail(@Param('id') id: string): Promise<TransactionItemView> {
    const merchantId = this.principal.current().merchantId;
    const tx = await this.service.findById(merchantId, id);
    if (!tx) {
      throw new ProblemException('TRANSACTION_NOT_FOUND', 404, 'Transaction not found.');
    }
    return tx;
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get transaction receipt HTML or printable document' })
  async getReceipt(@Param('id') id: string, @Res() res: Response) {
    const merchantId = this.principal.current().merchantId;
    const tx = await this.service.findById(merchantId, id);
    if (!tx) {
      throw new ProblemException('TRANSACTION_NOT_FOUND', 404, 'Transaction not found.');
    }
    const html = renderReceiptHtml({
      transactionId: tx.id,
      externalReference: tx.externalReference,
      gatewayTransactionId: tx.gatewayTransactionId,
      type: tx.type,
      status: tx.status,
      grossAmountCents: tx.grossAmountCents,
      feeAmountCents: tx.feeAmountCents,
      netAmountCents: tx.netAmountCents,
      occurredAt: tx.occurredAt
    });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
