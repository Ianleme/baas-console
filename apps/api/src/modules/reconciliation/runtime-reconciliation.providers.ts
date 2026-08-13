import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import type { LeraBoxReconciliationClient } from '../../integrations/lera-box/reconciliation/lera-box-reconciliation.client.js';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthService } from '../auth/auth.service.js';
import { GatewayCredentialService } from '../gateway-accounts/gateway-credential.service.js';
import type { ReconciliationPrincipalProvider } from './reconciliation.controller.js';
import { ReconciliationService, type ReconciliationStore } from './reconciliation.service.js';

import { extractAccessToken } from '../auth/extract-token.js';

@Injectable({ scope: Scope.REQUEST })
export class BearerReconciliationPrincipal implements ReconciliationPrincipalProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly auth: AuthService
  ) {}
  current() {
    const token = extractAccessToken(this.request);
    if (!token) throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    try {
      const principal = this.auth.verifyAccessToken(token);
      return { merchantId: principal.merchantId, gatewayAccessToken: '' };
    } catch {
      throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
  }
}

export class RuntimeReconciliationService extends ReconciliationService {
  constructor(
    gateway: LeraBoxReconciliationClient,
    store: ReconciliationStore,
    private readonly credentials: GatewayCredentialService
  ) {
    super(gateway, store);
  }
  override async verify(
    merchantId: string,
    operationId: string
  ): Promise<Awaited<ReturnType<ReconciliationService['verify']>>> {
    return super.verify(merchantId, operationId, await this.credentials.accessToken(merchantId));
  }
}
