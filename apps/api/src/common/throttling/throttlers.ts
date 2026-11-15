import type { ThrottlerOptions } from '@nestjs/throttler';
import { normalizeEmail } from '../../modules/users/users.service';

/** What the throttler passes to a tracker: the Express request, typed loosely by the library. */
type TrackedRequest = {
  ip?: string;
  body?: unknown;
  user?: { id: string };
  params?: Record<string, string | undefined>;
};

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
 * The logged-in account; these limits only sit on routes behind the global JwtAuthGuard, which
 * has set `req.user` before any controller guard runs. The IP is a fallback that never applies.
 */
const byUser = (req: TrackedRequest): string => req.user?.id ?? req.ip ?? '';

/** One counter per throttler and tracker for every route it is on (the default adds the route). */
const sharedKey: NonNullable<ThrottlerOptions['generateKey']> = (_context, tracker, name) =>
  `${name}:${tracker}`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Limits of the public auth routes and of the password confirmation (docs/07-security.md).
 * Every AuthController route starts with all of them skipped except `ip` and switches on the
 * others where they apply; `DELETE /me` uses only `password`.
 */
const AUTH_THROTTLERS = [
  /** Each anonymous request may cost an argon2 hash (64 MiB) or an email: per-IP ceiling. */
  { name: 'ip', limit: 20, ttl: MINUTE, generateKey: sharedKey },
  /** Password guessing of one account; users behind one NAT do not lock each other out. */
  {
    name: 'login',
    limit: 5,
    ttl: MINUTE,
    getTracker: (req: TrackedRequest) => `${req.ip ?? ''}|${bodyEmail(req)}`,
  },
  /** Reset emails to one address: no mail bombing, no endless voiding of the victim's link. */
  {
    name: 'email',
    limit: 3,
    ttl: HOUR,
    getTracker: (req: TrackedRequest) => bodyEmail(req),
  },
  /**
   * Password confirmations of a logged-in user (`DELETE /me`, T-26): a stolen access token must
   * not guess the password at the speed of the server. After the global JwtAuthGuard: per account.
   */
  { name: 'password', limit: 5, ttl: MINUTE, getTracker: byUser },
] as const satisfies ThrottlerOptions[];

/**
 * Limits of the writes a logged-in account can repeat without bound (T-28, docs/07-security.md):
 * the disk (`uploads/`), the super-admin queue and the reputation of the sender domain.
 * Generous for a person, tight for a script; 429 RATE_LIMITED like the auth limits.
 */
const ACCOUNT_THROTTLERS = [
  /**
   * `POST /waters/suggestions`: the author is not stored, so this is the only brake on spam.
   * Rejected attempts count too (the guard runs before validation), hence room for typos.
   */
  { name: 'suggestion', limit: 10, ttl: DAY, getTracker: byUser },
  /** `POST /me/external-permits`: each may carry a 5 MB photo. */
  { name: 'externalPermit', limit: 20, ttl: DAY, getTracker: byUser },
  /** Every file upload of an account, one counter for all routes (photos, claim documents). */
  { name: 'upload', limit: 30, ttl: HOUR, getTracker: byUser, generateKey: sharedKey },
  /** Invitation emails sent by one admin, in any of their organizations. */
  {
    name: 'invitationAdmin',
    limit: 20,
    ttl: HOUR,
    getTracker: byUser,
    generateKey: sharedKey,
  },
  /**
   * Invitation emails of one organization, whoever sends them. Counted after the role guard:
   * the admin of another organization never reaches it and cannot use up this quota.
   */
  {
    name: 'invitationOrg',
    limit: 50,
    ttl: DAY,
    getTracker: (req: TrackedRequest) => req.params?.orgId ?? '',
    generateKey: sharedKey,
  },
] as const satisfies ThrottlerOptions[];

/**
 * All limits of the API. `@nestjs/throttler` applies every registered throttler on a guarded
 * route unless skipped, so routes name the ones they use (`RateLimit`, `onlyThrottlers`).
 * In-memory counters: enough for the single API instance on the VPS.
 */
export const THROTTLERS = [...AUTH_THROTTLERS, ...ACCOUNT_THROTTLERS];

export type ThrottlerName = (typeof THROTTLERS)[number]['name'];

export const THROTTLER_NAMES = THROTTLERS.map<ThrottlerName>(({ name }) => name);
