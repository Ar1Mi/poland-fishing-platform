import type { ThrottlerOptions } from '@nestjs/throttler';
import { normalizeEmail } from '../users/users.service';

/** What the throttler passes to a tracker: the Express request, typed loosely by the library. */
type TrackedRequest = { ip?: string; body?: unknown; user?: { id: string } };

/** Email from the body; guards run before validation, so the body may be anything. */
function bodyEmail(req: TrackedRequest): string {
  const body: unknown = req.body;
  return typeof body === 'object' &&
    body !== null &&
    'email' in body &&
    typeof body.email === 'string'
    ? normalizeEmail(body.email)
    : '';
}

/**
 * Limits of the public auth routes and of the password confirmation (docs/07-security.md).
 * Every AuthController route starts with all of them skipped except `ip` and switches on the
 * others where they apply; `DELETE /me` uses only `password`.
 * In-memory counters: enough for the single API instance on the VPS.
 */
export const AUTH_THROTTLERS = [
  /** Each anonymous request may cost an argon2 hash (64 MiB) or an email: per-IP ceiling. */
  {
    name: 'ip',
    limit: 20,
    ttl: 60_000,
    // One counter for all auth routes (the default key also includes the route).
    generateKey: (_context, tracker, name) => `${name}:${tracker}`,
  },
  /** Password guessing of one account; users behind one NAT do not lock each other out. */
  {
    name: 'login',
    limit: 5,
    ttl: 60_000,
    getTracker: (req: TrackedRequest) => `${req.ip ?? ''}|${bodyEmail(req)}`,
  },
  /** Reset emails to one address: no mail bombing, no endless voiding of the victim's link. */
  {
    name: 'email',
    limit: 3,
    ttl: 60 * 60_000,
    getTracker: (req: TrackedRequest) => bodyEmail(req),
  },
  /**
   * Password confirmations of a logged-in user (`DELETE /me`, T-26): a stolen access token must
   * not guess the password at the speed of the server. After the global JwtAuthGuard: per account.
   */
  {
    name: 'password',
    limit: 5,
    ttl: 60_000,
    getTracker: (req: TrackedRequest) => req.user?.id ?? req.ip ?? '',
  },
] as const satisfies ThrottlerOptions[];
