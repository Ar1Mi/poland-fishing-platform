import { ErrorCode } from '@lowisko/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, ClientErrorCode, errorMessageKey, parseErrorBody } from './errors';

describe('parseErrorBody', () => {
  it('keeps code, message, status and details of an API error body', () => {
    const error = parseErrorBody(
      {
        code: 'VALIDATION_FAILED',
        message: 'Bad input',
        details: { fields: { email: ['isEmail'] } },
      },
      400,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Bad input',
      status: 400,
      details: { fields: { email: ['isEmail'] } },
    });
  });

  it('maps a code unknown to this client to UNKNOWN_ERROR', () => {
    expect(parseErrorBody({ code: 'SOMETHING_NEW', message: 'x' }, 409).code).toBe(
      ClientErrorCode.UNKNOWN_ERROR,
    );
  });

  it.each([502, 503, 504])(
    'maps a gateway error %i without an API body to NETWORK_ERROR',
    (status) => {
      expect(parseErrorBody('<html>Bad Gateway</html>', status)).toMatchObject({
        code: ClientErrorCode.NETWORK_ERROR,
        status,
      });
    },
  );

  it('maps any other error without an API body to UNKNOWN_ERROR with the status', () => {
    expect(parseErrorBody('<html>Server Error</html>', 500)).toMatchObject({
      code: ClientErrorCode.UNKNOWN_ERROR,
      status: 500,
    });
  });

  it('keeps the API code when a 503 carries an API error body', () => {
    expect(parseErrorBody({ code: 'INTERNAL_ERROR', message: 'db down' }, 503).code).toBe(
      ErrorCode.INTERNAL_ERROR,
    );
  });
});

describe('errorMessageKey', () => {
  it('points an ApiError to its code under errors', () => {
    expect(errorMessageKey(new ApiError(ErrorCode.EMAIL_TAKEN, 'taken', 409))).toBe(
      'errors.EMAIL_TAKEN',
    );
  });

  it('falls back to UNKNOWN_ERROR for any other thrown value', () => {
    expect(errorMessageKey(new TypeError('boom'))).toBe('errors.UNKNOWN_ERROR');
  });
});
