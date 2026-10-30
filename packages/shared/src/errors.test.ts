import { describe, expect, it } from 'vitest';
import { CatchErrorCode, ERROR_HTTP_STATUS, ErrorCode } from './errors.js';

describe('error codes', () => {
  it.each([
    ['ErrorCode', ErrorCode],
    ['CatchErrorCode', CatchErrorCode],
  ])('%s values are UPPER_SNAKE_CASE and equal to their keys', (_name, codes) => {
    for (const [key, value] of Object.entries(codes)) {
      expect(value).toBe(key);
      expect(value).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    }
  });

  it('keeps HTTP errors and catch violations disjoint', () => {
    const http = new Set<string>(Object.values(ErrorCode));
    expect(Object.values(CatchErrorCode).filter((code) => http.has(code))).toEqual([]);
  });

  it('maps every ErrorCode to the status documented in docs/05-api.md', () => {
    const documented: Record<number, ErrorCode[]> = {
      400: ['VALIDATION_FAILED', 'INVALID_TOKEN', 'PAYMENT_AMOUNT_MISMATCH'],
      401: ['UNAUTHENTICATED', 'INVALID_CREDENTIALS', 'EMAIL_NOT_VERIFIED', 'TOKEN_EXPIRED'],
      403: ['FORBIDDEN', 'ORG_SCOPE_VIOLATION', 'ORG_NOT_ACTIVE'],
      404: ['NOT_FOUND'],
      409: [
        'EMAIL_TAKEN',
        'NIP_TAKEN',
        'CLAIM_ALREADY_PENDING',
        'WATER_ALREADY_CONNECTED',
        'CLAIM_NOT_PENDING',
        'PERMIT_TYPE_IN_USE',
        'RULE_ALREADY_EXISTS',
      ],
      422: [
        'PERMIT_START_IN_PAST',
        'DISCOUNT_NOT_ELIGIBLE',
        'PERMIT_TYPE_INACTIVE',
        'EDIT_WINDOW_CLOSED',
        'PERMIT_NOT_REVOCABLE',
        'PERMIT_NOT_VALID',
      ],
      429: ['RATE_LIMITED'],
      500: ['INTERNAL_ERROR'],
    };
    const expected = Object.fromEntries(
      Object.entries(documented).flatMap(([status, codes]) =>
        codes.map((code) => [code, Number(status)]),
      ),
    );

    expect(ERROR_HTTP_STATUS).toEqual(expected);
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual(Object.values(ErrorCode).sort());
  });
});
