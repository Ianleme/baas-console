import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
import { WithdrawalsService, type WithdrawalView } from './withdrawals.service.js';

export interface WithdrawalsPrincipalProvider {
  current(): { merchantId: string };
}

@ApiTags('withdrawals')
@ApiBearerAuth()
@Controller('api/v1/withdrawals')
export class WithdrawalsController {
  constructor(
    private readonly service: WithdrawalsService,
    @Inject('WithdrawalsPrincipalProvider')
    private readonly principal: WithdrawalsPrincipalProvider
  ) {}

  @Post()
  @ApiCreatedResponse({ description: 'Request a new payout withdrawal' })
  request(@Body() dto: CreateWithdrawalDto): Promise<WithdrawalView> {
    return this.service.requestWithdrawal(this.principal.current().merchantId, dto);
  }

  @Get()
  @ApiOkResponse({ description: 'List merchant withdrawals' })
  list(): Promise<WithdrawalView[]> {
    return this.service.list(this.principal.current().merchantId);
  }
}
