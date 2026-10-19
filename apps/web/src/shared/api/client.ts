import createClient from 'openapi-fetch';
import { ApiError, ClientErrorCode, parseErrorBody } from './errors';
import type { paths } from './schema';

/**
 * Typed API client generated from the Swagger document (`pnpm gen:api`). Paths carry the
 * `/api/v1` prefix; the API is served from the same origin (Vite proxy in dev, Caddy in prod).
 */
export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  // Resolved on each call rather than captured once, so tests can stub `fetch`.
  fetch: (input) => globalThis.fetch(input),
});

type ClientResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Runs a client call for TanStack Query: returns `data` or throws an ApiError, so components
 * only deal with `{ code }`. A cancelled request (query unmount) is rethrown unchanged.
 */
export async function request<T>(call: () => Promise<ClientResult<T>>): Promise<T> {
  let result: ClientResult<T>;
  try {
    result = await call();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(ClientErrorCode.NETWORK_ERROR, 'The API could not be reached', undefined);
  }
  if (!result.response.ok) {
    throw parseErrorBody(result.error, result.response.status);
  }
  return result.data as T;
}
