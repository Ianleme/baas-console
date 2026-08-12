import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ListTransactionsDto } from './dto/list-transactions.dto.js';
import { TransactionsService, type TransactionStatementView } from './transactions.service.js';

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
}
