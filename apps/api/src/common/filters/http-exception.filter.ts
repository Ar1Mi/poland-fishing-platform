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

const INTERNAL_MESSAGE = 'Internal server error';

// Framework exceptions (unknown route, guard rejection, malformed body) carry no code of their own.
const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  429: ErrorCode.RATE_LIMITED,
};

function clientError(status: number, message: string): { status: number; body: ErrorBody } {
  return { status, body: { code: CODE_BY_STATUS[status] ?? ErrorCode.VALIDATION_FAILED, message } };
}

/**
 * Status of an error raised by the Express body parser (`http-errors` shape: `expose` + `type`).
 * Other thrown objects with a `statusCode`, e.g. from an HTTP client, are not trusted.
 */
function bodyParserStatus(exception: unknown): number | undefined {
  if (
    !(exception instanceof Error) ||
    !('expose' in exception && exception.expose === true) ||
    !('type' in exception && typeof exception.type === 'string') ||
    !('statusCode' in exception && typeof exception.statusCode === 'number')
  ) {
    return undefined;
  }
  const { statusCode } = exception;
  return statusCode >= 400 && statusCode < 500 ? statusCode : undefined;
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
    return status < 500
      ? clientError(status, exception.message)
      : { status, body: { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_MESSAGE } };
  }
  const parserStatus = bodyParserStatus(exception);
  if (parserStatus !== undefined) {
    return clientError(parserStatus, (exception as Error).message);
  }
  // Anything else is a bug: the cause goes to the log, never to the client.
  return { status: 500, body: { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_MESSAGE } };
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
    const response = host.switchToHttp().getResponse<Response>();
    // A streamed response (file, PDF) that fails midway cannot be turned into a JSON error.
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(status).json(body);
  }
}
