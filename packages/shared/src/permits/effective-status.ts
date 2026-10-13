import { PermitStatus } from '../enums.js';
import { warsawDate, type DateOnly } from '../time/warsaw.js';

/** Stored statuses that are final as-is, plus the ones computed from dates for PAID (ADR-0005). */
export const EffectivePermitStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CANCELLED: 'CANCELLED',
  REVOKED: 'REVOKED',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
} as const;
export type EffectivePermitStatus =
  (typeof EffectivePermitStatus)[keyof typeof EffectivePermitStatus];

export interface PermitStatusInput {
  status: PermitStatus;
  /** First valid day, `YYYY-MM-DD` (a calendar day in Europe/Warsaw, not an instant). */
  validFrom: DateOnly;
  /** Last valid day, inclusive, `YYYY-MM-DD`. */
  validTo: DateOnly;
}

/** A PAID permit is ACTIVE for the whole Warsaw calendar days `validFrom`…`validTo`. */
export function effectivePermitStatus(permit: PermitStatusInput, now: Date): EffectivePermitStatus {
  if (permit.status !== PermitStatus.PAID) return permit.status;

  const today = warsawDate(now);
  if (today < permit.validFrom) return EffectivePermitStatus.SCHEDULED;
  if (today > permit.validTo) return EffectivePermitStatus.EXPIRED;
  return EffectivePermitStatus.ACTIVE;
}
