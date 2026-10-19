import { ErrorCode } from '@lowisko/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, ClientErrorCode } from '../shared/api/errors';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('does not retry a 4xx answer', () => {
    expect(shouldRetry(0, new ApiError(ErrorCode.NOT_FOUND, 'missing', 404))).toBe(false);
  });

  it('retries a network failure and a 5xx answer twice', () => {
    const offline = new ApiError(ClientErrorCode.NETWORK_ERROR, 'offline');
    const serverError = new ApiError(ErrorCode.INTERNAL_ERROR, 'boom', 500);

    expect([0, 1, 2].map((count) => shouldRetry(count, offline))).toEqual([true, true, false]);
    expect([0, 1, 2].map((count) => shouldRetry(count, serverError))).toEqual([true, true, false]);
  });
});
