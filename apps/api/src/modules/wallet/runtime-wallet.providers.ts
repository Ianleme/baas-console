import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthService } from '../auth/auth.service.js';
import type { WalletPrincipalProvider } from './wallet.controller.js';

import { extractAccessToken } from '../auth/extract-token.js';

@Injectable({ scope: Scope.REQUEST })
export class BearerWalletPrincipal implements WalletPrincipalProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly auth: AuthService
  ) {}

  current(): { merchantId: string } {
    const token = extractAccessToken(this.request);
    if (!token) {
      throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
    try {
      const principal = this.auth.verifyAccessToken(token);
      return { merchantId: principal.merchantId };
    } catch {
      throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
  }
}
