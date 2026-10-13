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

  it('maps every ErrorCode to a 4xx status', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual(Object.values(ErrorCode).sort());
    for (const status of Object.values(ERROR_HTTP_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
  });
});
