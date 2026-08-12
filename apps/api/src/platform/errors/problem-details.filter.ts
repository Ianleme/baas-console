import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ContextRequest } from '../request-context/request-context.js';
import { ProblemException } from './problem.exception.js';

const internalError = {
  code: 'INTERNAL_ERROR',
  title: 'Internal error',
  detail: 'An unexpected error occurred.'
};

const statusDefaults: Record<number, { code: string; title: string; detail: string }> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'VALIDATION_FAILED',
    title: 'Invalid request',
    detail: 'The request contains invalid fields.'
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'RESOURCE_NOT_FOUND',
    title: 'Resource not found',
    detail: 'The requested resource was not found.'
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: internalError,
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    title: 'Service unavailable',
    detail: 'The service is temporarily unavailable.'
  }
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<ContextRequest & Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const defaults = statusDefaults[status] ?? internalError;
    const problem =
      exception instanceof ProblemException
        ? { code: exception.code, detail: exception.safeDetail }
        : { code: defaults.code, detail: defaults.detail };

    response
      .status(status)
      .type('application/problem+json')
      .send({
        type: `https://baas-console.invalid/problems/${problem.code.toLowerCase()}`,
        title: defaults.title,
        status,
        code: problem.code,
        detail: problem.detail,
        instance: request.path,
        requestId: request.requestContext?.requestId
      });
  }
}
