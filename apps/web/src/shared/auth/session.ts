import { forgetDeviceOwner, recentDeviceOwner } from '../offline/db';

/*
 * Login session of this tab. The access token lives only in memory (docs/07-security.md):
 * a reload loses it and `restoreSession()` gets a new one from the httpOnly refresh cookie.
 * Without network the device may act for the user whose permits it holds (`offline`, ADR-0009):
 * no token, only the angler's offline pages, until the network returns.
 */

export type SessionStatus = 'restoring' | 'authenticated' | 'offline' | 'guest';

let accessToken: string | null = null;
let status: SessionStatus = 'restoring';
/** The user of an `offline` session: the owner of the data on the device. */
let offlineUserId: string | null = null;
/**
 * The same user once the offline session becomes a real one (network back): their profile
 * loads anew meanwhile, and the screens on the device's data must not lose who it is.
 */
let carriedUserId: string | null = null;
/** Grows with every login and logout: work started for one session must not land in the next. */
let generation = 0;
let pendingRefresh: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

const REFRESH_PATH = '/api/v1/auth/refresh';
/** A 401 from these means wrong credentials or no session: refreshing would not help. */
const NO_RETRY_PATHS = new Set([
  REFRESH_PATH,
  '/api/v1/auth/login',
  // TOKEN_EXPIRED there is about the email link, not the access token.
  '/api/v1/auth/verify-email',
  '/api/v1/auth/reset-password',
]);

function update(token: string | null): void {
  accessToken = token;
  offlineUserId = null;
  status = token ? 'authenticated' : 'guest';
  notify();
}

function notify(): void {
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

/** The user an `offline` session acts for; null in any other state. */
export function getOfflineUserId(): string | null {
  return offlineUserId;
}

/** The user of the offline session this one grew out of; null after a login or logout. */
export function getCarriedUserId(): string | null {
  return carriedUserId;
}

/** Changes on login and logout (`refreshDeviceData` drops data fetched for an older one). */
export function getSessionGeneration(): number {
  return generation;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** After login. */
export function startSession(token: string): void {
  carriedUserId = null;
  generation += 1;
  update(token);
}

/** After logout, or when the refresh cookie is no longer accepted. */
export function endSession(): void {
  carriedUserId = null;
  generation += 1;
  update(null);
}

/**
 * How long the start waits for the refresh: by the water the network often only seems to
 * work, and a blank screen instead of the catch form is the worst answer.
 */
export const RESTORE_TIMEOUT_MS = 8000;

/**
 * Trades the refresh cookie for a new access token. Concurrent callers share one request:
 * a second refresh with the same cookie would look like token theft and end the session.
 * Resolves to null when there is no valid session. Only a 401 ends the session: a network
 * failure or a 5xx/429 keeps it, so a short API outage does not log the user out.
 */
export function refreshSession(): Promise<string | null> {
  pendingRefresh ??= (async () => {
    try {
      const waitsAtStart = status === 'restoring' || status === 'offline';
      const response = await globalThis.fetch(
        new Request(new URL(REFRESH_PATH, location.origin), {
          method: 'POST',
          signal: waitsAtStart ? AbortSignal.timeout(RESTORE_TIMEOUT_MS) : undefined,
        }),
      );
      if (response.status === 401) {
        // Whoever could not log in online must not act offline either (ADR-0013).
        await forgetDeviceOwner().catch(() => undefined);
        endSession();
        return null;
      }
      if (!response.ok) {
        throw new Error(`Refresh failed with ${String(response.status)}`);
      }
      const { accessToken: token } = (await response.json()) as { accessToken: string };
      update(token);
      return token;
    } catch {
      // Unknown outcome: on start the device acts for its recent user offline, if it holds one,
      // otherwise the user is a guest; later the session stays as it is.
      if (status === 'restoring') {
        const userId = await recentDeviceOwner(new Date());
        if (userId) {
          accessToken = null;
          offlineUserId = userId;
          carriedUserId = userId;
          status = 'offline';
          notify();
        } else {
          update(null);
        }
      }
      return null;
    } finally {
      pendingRefresh = null;
    }
  })();
  return pendingRefresh;
}

// Back online, or back to the app: the offline session tries to become a real one (a 401
// makes it a guest). The second also covers a session opened offline by a failing server.
globalThis.addEventListener('online', () => {
  if (status === 'offline') {
    void refreshSession();
  }
});
globalThis.document?.addEventListener('visibilitychange', () => {
  if (status === 'offline' && document.visibilityState === 'visible') {
    void refreshSession();
  }
});

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
  offlineUserId = null;
  carriedUserId = null;
  generation = 0;
  status = 'restoring';
  pendingRefresh = null;
  listeners.clear();
}
