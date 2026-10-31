import { PermitStatus } from '../../enums.js';
import { CatchErrorCode } from '../../errors.js';
import { EffectivePermitStatus, effectivePermitStatus } from '../../permits/effective-status.js';
import type { CatchRule, PermitSnapshot } from './types.js';

// BR-01: the permit is active at the moment of the catch and covers its water. Checked for
// released fish too.

const id = 'BR-01';

/**
 * Status of the permit on the Warsaw day of the catch, not of the check: a catch recorded offline
 * and synced after the permit ended still counts. REVOKED stays REVOKED for every catch, even one
 * caught before the revocation. An external permit has no status, only its dates.
 */
function statusAt(permit: PermitSnapshot, caughtAt: Date): EffectivePermitStatus {
  const status = permit.kind === 'PLATFORM' ? permit.status : PermitStatus.PAID;
  return effectivePermitStatus(
    { status, validFrom: permit.validFrom, validTo: permit.validTo },
    caughtAt,
  );
}

export const permitActiveRule: CatchRule = {
  id,
  check({ catch: fish, permit }) {
    const status = statusAt(permit, fish.caughtAt);
    if (status === EffectivePermitStatus.ACTIVE) {
      return null;
    }
    return {
      code: CatchErrorCode.PERMIT_NOT_ACTIVE,
      ruleId: id,
      details: { status, validFrom: permit.validFrom, validTo: permit.validTo },
    };
  },
};

export const permitWaterRule: CatchRule = {
  id,
  check({ catch: fish, permit }) {
    return permit.waterIds.includes(fish.fishingWaterId)
      ? null
      : { code: CatchErrorCode.PERMIT_WATER_MISMATCH, ruleId: id };
  },
};
