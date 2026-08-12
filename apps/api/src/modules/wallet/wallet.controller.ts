import { Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { WalletService, WalletUnavailableError, type WalletView } from './wallet.service.js';

export interface WalletPrincipalProvider {
  current(): { merchantId: string };
}

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('api/v1/wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    @Inject('WalletPrincipalProvider') private readonly principal: WalletPrincipalProvider
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Latest tenant wallet snapshot with freshness state' })
  current(): Promise<WalletView> {
    return this.handle(() => this.wallet.current(this.principal.current().merchantId));
  }

  @Post('refresh')
  @ApiOkResponse({ description: 'Fresh authoritative gateway wallet snapshot' })
  refresh(): Promise<WalletView> {
    return this.handle(() => this.wallet.refresh(this.principal.current().merchantId));
  }

  private async handle(operation: () => Promise<WalletView>): Promise<WalletView> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof WalletUnavailableError) {
        throw new ProblemException(
          error.code,
          503,
          'The gateway wallet is temporarily unavailable.'
        );
      }
      throw error;
    }
  }
}
