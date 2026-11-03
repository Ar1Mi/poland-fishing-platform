import {
  type CatchInput,
  type RuleViolation,
  type SameDayCatch,
  addDays,
  resolveEffectiveRule,
  validateCatch,
  warsawDate,
} from '@lowisko/shared';
import type { DevicePermit, QueuedCatch } from '../../../shared/offline/db';
import type { DeviceData } from '../../../shared/offline/use-device';
import { storedStatus, withStatusAt } from '../../permits/lib/device-status';
import type { Catch } from '../api/useCatches';

// The CatchValidator on the device (ADR-0003, ADR-0009): the same `validateCatch` the server
// runs, with the permits, rules and catches the device holds. The server has the last word.

/**
 * Permits a catch can be recorded on: active now, or ended yesterday — a catch of yesterday is
 * still recorded and changed on it (BR-01 is checked at `caughtAt`, the BR-07 window).
 */
export function recordablePermits(permits: DevicePermit[], now: Date): DevicePermit[] {
  const yesterday = addDays(warsawDate(now), -1);
  return permits
    .map((permit) => withStatusAt(permit, now))
    .filter(
      (permit) =>
        permit.status === 'ACTIVE' || (permit.status === 'EXPIRED' && permit.validTo === yesterday),
    );
}

/**
 * Kept catches that count towards the daily limits (docs/02-business-rules.md: of every
 * water). With the server's register at hand it decides about every catch it has — one deleted
 * or changed there no longer counts as the device first recorded it — and the device adds only
 * what still waits to be sent. Without it the device counts its own accepted and waiting
 * catches. A waiting one passed this check, so it is counted as the server will count it.
 */
export function sameDayKeptOf(server: Catch[] | undefined, queue: QueuedCatch[]): SameDayCatch[] {
  const onServer = new Set(server?.map((fish) => fish.clientId));
  const counted = (row: QueuedCatch) =>
    row.status === 'PENDING_SYNC' || (server === undefined && row.status === 'ACCEPTED');
  return [
    ...(server ?? [])
      .filter((fish) => fish.kept && fish.status === 'ACCEPTED')
      .map(({ speciesId, caughtAt, weightG }) => ({
        speciesId,
        caughtAt: new Date(caughtAt),
        weightG,
        kept: true,
      })),
    ...queue
      .filter((row) => !onServer.has(row.clientId) && row.item.kept && counted(row))
      .map(({ item }) => ({
        speciesId: item.speciesId,
        caughtAt: new Date(item.caughtAt),
        weightG: item.weightG ?? null,
        kept: true,
      })),
  ];
}

/** No rule of any level for the species on the water. */
const NO_RULE = resolveEffectiveRule([]);

/** Violations of a catch on `permit`, as the server would find them now. */
export function checkOnDevice(
  fish: CatchInput,
  permit: DevicePermit,
  device: DeviceData,
  sameDayKept: SameDayCatch[],
  now: Date,
): RuleViolation[] {
  const species = device.species.find((item) => item.id === fish.speciesId);
  if (!species) {
    // Only species of the device can be chosen; a stale choice is checked by the server.
    return [];
  }
  const rule = device.rules
    .get(permit.id)
    ?.find((water) => water.waterId === fish.fishingWaterId)
    ?.rules.find((item) => item.speciesId === fish.speciesId);
  return validateCatch({
    catch: fish,
    permit: {
      kind: 'PLATFORM',
      status: storedStatus(permit.status),
      validFrom: permit.validFrom,
      validTo: permit.validTo,
      waterIds: permit.waters.map((water) => water.id),
    },
    species: { id: species.id, isProtected: species.isProtected },
    effectiveRule: rule
      ? {
          minLengthCm: rule.minLengthCm,
          dailyLimitCount: rule.dailyLimitCount,
          dailyLimitWeightG: rule.dailyLimitWeightG,
          closedPeriods: rule.closedPeriods,
        }
      : NO_RULE,
    sameDayKept,
    now,
  });
}
