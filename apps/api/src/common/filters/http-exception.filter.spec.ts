import { ErrorCode } from '@lowisko/shared';
import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DomainError } from '../errors/domain-error';
import type { PinoLogger } from 'nestjs-pino';
import { HttpExceptionFilter, toErrorResponse } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  function run(exception: unknown, headersSent = false) {
    const logger = { error: jest.fn() };
    const response = {
      headersSent,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
    };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new HttpExceptionFilter(logger as unknown as PinoLogger).catch(
      exception,
      host as unknown as ArgumentsHost,
    );
    return { logger, response };
  }

  it('logs the cause of a 500 that the response hides', () => {
    const cause = new Error('connect ECONNREFUSED 10.0.0.5:5432');

    const { logger, response } = run(cause);

    expect(logger.error).toHaveBeenCalledWith({ err: cause }, 'Unhandled exception');
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('does not log client errors as errors', () => {
    const { logger, response } = run(new NotFoundException());

    expect(logger.error).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('ends a response that already started streaming instead of writing JSON', () => {
    const { response } = run(new Error('stream failed'), true);

    expect(response.json).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });
});

describe('toErrorResponse', () => {
  it('maps a DomainError to the HTTP status of its code and keeps details', () => {
    const error = new DomainError(ErrorCode.PERMIT_TYPE_INACTIVE, { permitTypeId: 'pt-1' });

    expect(toErrorResponse(error)).toEqual({
      status: 422,
      body: {
        code: 'PERMIT_TYPE_INACTIVE',
        message: 'PERMIT_TYPE_INACTIVE',
        details: { permitTypeId: 'pt-1' },
      },
    });
  });

  it('omits details when a DomainError has none', () => {
    const { body } = toErrorResponse(new DomainError(ErrorCode.EMAIL_TAKEN));

    expect(body).toEqual({ code: 'EMAIL_TAKEN', message: 'EMAIL_TAKEN' });
  });

  it('uses the custom developer message of a DomainError', () => {
    const error = new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water not found');

    expect(toErrorResponse(error).body.message).toBe('Water not found');
  });

  it.each([
    [new BadRequestException(), 400, 'VALIDATION_FAILED'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new HttpException('Payload too large', 413), 413, 'VALIDATION_FAILED'],
    [new HttpException('Too many requests', 429), 429, 'RATE_LIMITED'],
  ])('maps framework exception %s to %i %s', (exception, status, code) => {
    const response = toErrorResponse(exception);

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(response.body).not.toHaveProperty('details');
  });

  it('keeps the status of a 5xx HttpException but hides its message', () => {
    const error = new ServiceUnavailableException('db 10.0.0.5:5432 unreachable');

    expect(toErrorResponse(error)).toEqual({
      status: 503,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('keeps the 4xx status of a body-parser error', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      statusCode: 400,
      expose: true,
      type: 'entity.parse.failed',
    });

    expect(toErrorResponse(error)).toEqual({
      status: 400,
      body: { code: 'VALIDATION_FAILED', message: 'Unexpected token' },
    });
  });

  it.each([
    ['an Error', new Error('connect ECONNREFUSED 10.0.0.5:5432')],
    [
      'an HTTP client error carrying the 401 of an external service',
      Object.assign(new Error('Unauthorized by P24'), { statusCode: 401 }),
    ],
    [
      'a body-parser-shaped error with a 5xx status',
      Object.assign(new Error('boom'), { statusCode: 502, expose: true, type: 'x' }),
    ],
    ['a thrown string', 'boom'],
    ['null', null],
  ])('hides the cause of %s behind INTERNAL_ERROR', (_name, exception) => {
    expect(toErrorResponse(exception)).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
