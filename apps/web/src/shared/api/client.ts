import createClient from 'openapi-fetch';
import { authorizedFetch } from '../auth/session';
import { ApiError, ClientErrorCode, parseErrorBody } from './errors';
import type { paths } from './schema';

/**
 * Typed API client generated from the Swagger document (`pnpm gen:api`). Paths carry the
 * `/api/v1` prefix; the API is served from the same origin (Vite proxy in dev, Caddy in prod).
 */
export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  // Adds the access token and refreshes it once on 401; resolves `fetch` on each call,
  // so tests can stub it.
  fetch: authorizedFetch,
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
    // fetch rejects with TypeError when no response arrives; anything else (e.g. a 200 with an
    // HTML body that is not JSON) means the server answered, but not as the API.
    if (error instanceof TypeError) {
      throw new ApiError(ClientErrorCode.NETWORK_ERROR, 'The API could not be reached');
    }
    throw new ApiError(ClientErrorCode.UNKNOWN_ERROR, 'Unexpected response from the API');
  }
  if (!result.response.ok) {
    throw parseErrorBody(result.error, result.response.status);
  }
  return result.data as T;
}
