import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

export interface RequestContext {
  correlationId?: string;
  requestId: string;
}

export type ContextRequest = Request & { requestContext?: RequestContext };
