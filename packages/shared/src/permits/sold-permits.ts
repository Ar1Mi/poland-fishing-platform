import { EffectivePermitStatus } from './effective-status.js';

// Permits sold by an organization (FR-10): its admin's list filters them by these.

/** Statuses of a sold permit: paid (scheduled, active, expired), then maybe revoked. */
export const SOLD_PERMIT_STATUSES = [
  EffectivePermitStatus.SCHEDULED,
  EffectivePermitStatus.ACTIVE,
  EffectivePermitStatus.EXPIRED,
  EffectivePermitStatus.REVOKED,
] as const;
export type SoldPermitStatus = (typeof SOLD_PERMIT_STATUSES)[number];

/** A fragment of a permit number: `ZW-2026-000123` has 14 characters, 7-digit numbers 15. */
export const PERMIT_NUMBER_QUERY_MAX_LENGTH = 20;
