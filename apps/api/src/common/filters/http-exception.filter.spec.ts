import { ErrorCode } from '@lowisko/shared';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DomainError } from '../errors/domain-error';
import { toErrorResponse } from './http-exception.filter';

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
    [new ServiceUnavailableException(), 503, 'INTERNAL_ERROR'],
  ])('maps framework exception %s to %i %s', (exception, status, code) => {
    const response = toErrorResponse(exception);

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(response.body).not.toHaveProperty('details');
  });

  it('keeps the 4xx status of an Express middleware error', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), { statusCode: 400 });

    expect(toErrorResponse(error)).toEqual({
      status: 400,
      body: { code: 'VALIDATION_FAILED', message: 'Unexpected token' },
    });
  });

  it.each([
    ['an Error', new Error('connect ECONNREFUSED 10.0.0.5:5432')],
    ['a middleware error with a 5xx status', Object.assign(new Error('boom'), { statusCode: 502 })],
    ['a thrown string', 'boom'],
    ['null', null],
  ])('hides the cause of %s behind INTERNAL_ERROR', (_name, exception) => {
    expect(toErrorResponse(exception)).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
