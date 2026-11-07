import { z } from 'zod';
import { EffectivePermitStatus } from './effective-status.js';

// Revocation of a sold permit by its organization (FR-10). A refund, if any, is made outside the
// platform; the reason records it. The API validates the same limit with class-validator.

export const REVOKE_REASON_MAX_LENGTH = 500;

/**
 * A permit that can still be used: an expired one has nothing left to stop, and a permit that
 * was never paid (or is already revoked) was never valid.
 */
export const REVOCABLE_STATUSES = [
  EffectivePermitStatus.SCHEDULED,
  EffectivePermitStatus.ACTIVE,
] as const;

export function isRevocable(status: EffectivePermitStatus): boolean {
  return (REVOCABLE_STATUSES as readonly EffectivePermitStatus[]).includes(status);
}

/** Body of `POST /orgs/:orgId/permits/:id/revoke`: the reason is required. */
export const revokePermitSchema = z.object({
  reason: z.string().trim().min(1).max(REVOKE_REASON_MAX_LENGTH),
});
export type RevokePermitInput = z.infer<typeof revokePermitSchema>;
