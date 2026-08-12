import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import type { TransactionsPrincipalProvider } from './transactions.controller.js';

@Injectable({ scope: Scope.REQUEST })
export class BearerTransactionsPrincipal implements TransactionsPrincipalProvider {
  constructor(@Inject(REQUEST) private readonly request: { merchant?: { id?: string } }) {}

  current(): { merchantId: string } {
    const merchantId = this.request.merchant?.id;
    if (!merchantId) {
      throw new ProblemException(
        'UNAUTHENTICATED',
        401,
        'Authentication required to access transactions.'
      );
    }
    return { merchantId };
  }
}
