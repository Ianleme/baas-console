import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthService } from '../auth/auth.service.js';
import { extractAccessToken } from '../auth/extract-token.js';
import type { WithdrawalsPrincipalProvider } from './withdrawals.controller.js';

@Injectable({ scope: Scope.REQUEST })
export class BearerWithdrawalsPrincipal implements WithdrawalsPrincipalProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request & { merchant?: { id?: string } },
    private readonly auth: AuthService
  ) {}

  current(): { merchantId: string } {
    const merchantId = this.request.merchant?.id;
    if (merchantId) return { merchantId };

    const token = extractAccessToken(this.request);
    if (!token) {
      throw new ProblemException(
        'UNAUTHENTICATED',
        401,
        'Authentication required to access withdrawals.'
      );
    }
    try {
      const principal = this.auth.verifyAccessToken(token);
      return { merchantId: principal.merchantId };
    } catch {
      throw new ProblemException(
        'UNAUTHENTICATED',
        401,
        'Authentication required to access withdrawals.'
      );
    }
  }
}
