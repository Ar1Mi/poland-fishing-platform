import { ERROR_HTTP_STATUS, ErrorCode } from '@lowisko/shared';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DomainError } from '../errors/domain-error';

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Framework exceptions (unknown route, guard rejection, malformed body) carry no code of their own.
const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  429: ErrorCode.RATE_LIMITED,
};

function codeForStatus(status: number): ErrorCode {
  return (
    CODE_BY_STATUS[status] ??
    (status < 500 ? ErrorCode.VALIDATION_FAILED : ErrorCode.INTERNAL_ERROR)
  );
}

/** Errors raised by Express middleware (body-parser) expose the status this way. */
function middlewareClientStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null || !('statusCode' in exception)) {
    return undefined;
  }
  const { statusCode } = exception;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
    ? statusCode
    : undefined;
}

export function toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof DomainError) {
    const { code, message, details } = exception;
    return {
      status: ERROR_HTTP_STATUS[code],
      body: { code, message, ...(details && { details }) },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { status, body: { code: codeForStatus(status), message: exception.message } };
  }
  const clientStatus = middlewareClientStatus(exception);
  if (clientStatus !== undefined) {
    const message = exception instanceof Error ? exception.message : 'Bad request';
    return { status: clientStatus, body: { code: codeForStatus(clientStatus), message } };
  }
  // Anything else is a bug: the cause goes to the log, never to the client.
  return {
    status: 500,
    body: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
  };
}

/** Renders every error as `{ code, message, details? }` (docs/05-api.md). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(HttpExceptionFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
