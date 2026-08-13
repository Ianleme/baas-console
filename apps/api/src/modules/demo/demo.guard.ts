import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { DEMO_READ_ONLY_CODE } from './demo.constants.js';
import { DemoService, type DemoPrincipal } from './demo.service.js';

export type DemoRequest = Request & { demoPrincipal?: DemoPrincipal };

@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  constructor(private readonly demo: DemoService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DemoRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) return true;
    const principal = this.demo.verifySession(authorization.slice('Bearer '.length));
    if (!principal) return true;
    request.demoPrincipal = principal;
    if (isReadOnlyRequest(request.method, request.path)) return true;
    throw new ProblemException(DEMO_READ_ONLY_CODE, 403, 'Demo sessions are read-only.');
  }
}

function isReadOnlyRequest(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  return method === 'POST' && /^\/api\/v1\/demo\/session\/?$/u.test(path);
}
