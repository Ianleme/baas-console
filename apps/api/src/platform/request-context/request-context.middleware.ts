import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import {
  CORRELATION_ID_HEADER,
  type ContextRequest,
  REQUEST_ID_HEADER
} from './request-context.js';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,64}$/u;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: ContextRequest, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const candidate = request.header(CORRELATION_ID_HEADER);
    request.requestContext = {
      requestId,
      ...(candidate && SAFE_CORRELATION_ID.test(candidate) ? { correlationId: candidate } : {})
    };
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
