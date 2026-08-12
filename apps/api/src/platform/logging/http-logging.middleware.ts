import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { Logger } from 'pino';

import type { ContextRequest } from '../request-context/request-context.js';
import { PLATFORM_LOGGER } from './platform-logger.js';

function routeTemplate(request: ContextRequest): string {
  const route = request.route as unknown;
  if (route && typeof route === 'object' && 'path' in route && typeof route.path === 'string') {
    return route.path;
  }
  return request.path;
}

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(PLATFORM_LOGGER) private readonly logger: Logger) {}

  use(request: ContextRequest, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.info({
        event: 'http.response',
        requestId: request.requestContext?.requestId,
        ...(request.requestContext?.correlationId
          ? { correlationId: request.requestContext.correlationId }
          : {}),
        method: request.method,
        route: routeTemplate(request),
        status: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100
      });
    });
    next();
  }
}
