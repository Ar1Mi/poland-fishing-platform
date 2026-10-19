import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/errors';

const MAX_RETRIES = 2;

/** A 4xx answer will not change on retry; network failures and 5xx are retried twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status !== undefined && error.status < 500) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
