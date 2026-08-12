import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { ReconciliationError, ReconciliationService } from './reconciliation.service.js';

export interface ReconciliationView {
  id: string;
  kind: 'PAYMENT' | 'WITHDRAWAL';
  reference: string;
  status: string;
  classification: string;
  updatedAt: string;
}

export interface ReconciliationQuery {
  list(merchantId: string): Promise<ReconciliationView[]>;
}

export interface ReconciliationPrincipalProvider {
  current(): { merchantId: string; gatewayAccessToken: string };
}

@Controller('api/v1/reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    @Inject('ReconciliationQuery')
    private readonly query: ReconciliationQuery,
    @Inject('ReconciliationPrincipalProvider')
    private readonly principal: ReconciliationPrincipalProvider
  ) {}

  @Get()
  list(): Promise<ReconciliationView[]> {
    return this.query.list(this.principal.current().merchantId);
  }

  @Post(':operationId/verify')
  @HttpCode(200)
  async verify(
    @Param('operationId') operationId: string,
    @Body() body: Record<string, unknown> | undefined
  ): Promise<{ classification: string }> {
    if (body && Object.keys(body).length > 0)
      throw new ProblemException('VALIDATION_FAILED', 400, 'No operation status may be submitted.');
    const principal = this.principal.current();
    try {
      return {
        classification: await this.reconciliation.verify(
          principal.merchantId,
          operationId,
          principal.gatewayAccessToken
        )
      };
    } catch (error) {
      if (error instanceof ReconciliationError)
        throw new ProblemException(error.code, 404, 'The operation was not found.');
      if (error instanceof Error && error.message.includes('LERA_BOX'))
        throw new ProblemException('GATEWAY_UNAVAILABLE', 503, 'The gateway is unavailable.');
      throw error;
    }
  }
}
