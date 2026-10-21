/*
 * Login session of this tab. The access token lives only in memory (docs/07-security.md):
 * a reload loses it and `restoreSession()` gets a new one from the httpOnly refresh cookie.
 */

export type SessionStatus = 'restoring' | 'authenticated' | 'guest';

let accessToken: string | null = null;
let status: SessionStatus = 'restoring';
let pendingRefresh: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

const REFRESH_PATH = '/api/v1/auth/refresh';
/** A 401 from these means wrong credentials or no session: refreshing would not help. */
const NO_RETRY_PATHS = new Set([REFRESH_PATH, '/api/v1/auth/login']);

function update(token: string | null): void {
  accessToken = token;
  status = token ? 'authenticated' : 'guest';
  listeners.forEach((listener) => {
    listener();
  });
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getSessionStatus(): SessionStatus {
  return status;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** After login. */
export function startSession(token: string): void {
  update(token);
}

/** After logout, or when the refresh cookie is no longer accepted. */
export function endSession(): void {
  update(null);
}

/**
 * Trades the refresh cookie for a new access token. Concurrent callers share one request:
 * a second refresh with the same cookie would look like token theft and end the session.
 * Resolves to null when there is no valid session; a network failure keeps the current state.
 */
export function refreshSession(): Promise<string | null> {
  pendingRefresh ??= (async () => {
    try {
      const response = await globalThis.fetch(
        new Request(new URL(REFRESH_PATH, location.origin), { method: 'POST' }),
      );
      if (!response.ok) {
        endSession();
        return null;
      }
      const { accessToken: token } = (await response.json()) as { accessToken: string };
      update(token);
      return token;
    } catch {
      if (status === 'restoring') {
        update(null);
      }
      return null;
    } finally {
      pendingRefresh = null;
    }
  })();
  return pendingRefresh;
}

/** Silent login on app start (a reload or a new tab). */
export async function restoreSession(): Promise<void> {
  if (status === 'restoring') {
    await refreshSession();
  }
}

/**
 * `fetch` of the API client: sends the access token and, when the API answers 401 to it
 * (expired), refreshes once and repeats the request.
 */
export async function authorizedFetch(input: Request): Promise<Response> {
  const sentToken = accessToken;
  const retry = sentToken ? input.clone() : undefined;
  const response = await globalThis.fetch(withToken(input, sentToken));
  if (response.status !== 401 || !retry || NO_RETRY_PATHS.has(new URL(input.url).pathname)) {
    return response;
  }
  const token = await refreshSession();
  return token ? globalThis.fetch(withToken(retry, token)) : response;
}

function withToken(request: Request, token: string | null): Request {
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }
  return request;
}

/** Test helper: back to a fresh page load. */
export function resetSessionForTests(): void {
  accessToken = null;
  status = 'restoring';
  pendingRefresh = null;
  listeners.clear();
}
