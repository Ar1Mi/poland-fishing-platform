import type { CookieOptions } from 'express';

// Lifetimes from docs/07-security.md (access, refresh) and docs/05-api.md (one-time links).

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Sliding: every rotation issues a token valid for another 7 days. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * How long an expired refresh token is kept before the nightly cleanup deletes it (T-26,
 * decided by the user): time to look into an incident. A revoked one is kept at least until it
 * expires anyway — while it might come back, it reveals a stolen copy (reuse revokes the family).
 */
export const REFRESH_TOKEN_RETENTION_DAYS = 30;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export const REFRESH_COOKIE = 'rt';
/** The browser sends the refresh cookie to the auth routes only. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** docs/07-security.md: httpOnly, Secure, SameSite=Strict, sent to the auth routes only. */
export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};
