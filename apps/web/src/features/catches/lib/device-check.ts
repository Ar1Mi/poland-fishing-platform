import {
  type CatchInput,
  type PermitSnapshot,
  type RuleViolation,
  type SameDayCatch,
  addDays,
  externalPermitStatus,
  resolveEffectiveRule,
  validateCatch,
  warsawDate,
} from '@lowisko/shared';
import type { QueuedCatch } from '../../../shared/offline/db';
import type { DeviceData } from '../../../shared/offline/use-device';
import { storedStatus, withStatusAt } from '../../permits/lib/device-status';
import type { Catch } from '../api/useCatches';
import { type PlacePermit, externalPlacePermit, platformPlacePermit } from './catch-form';

// The CatchValidator on the device (ADR-0003, ADR-0009): the same `validateCatch` the server
// runs, with the permits, rules and catches the device holds. The server has the last word.

/**
 * Permits a catch can be recorded on, platform and external (T-22): active now, or ended
 * yesterday — a catch of yesterday is still recorded and changed on it (BR-01 is checked at
 * `caughtAt`, the BR-07 window). The status is the device's at `now`.
 */
export function recordablePermits(
  device: Pick<DeviceData, 'permits' | 'externalPermits'>,
  now: Date,
): PlacePermit[] {
  const yesterday = addDays(warsawDate(now), -1);
  return [
    ...device.permits.map((permit) => platformPlacePermit(withStatusAt(permit, now))),
    ...device.externalPermits.map((permit) =>
      externalPlacePermit({ ...permit, status: externalPermitStatus(permit, now) }),
    ),
  ].filter(
    (permit) =>
      permit.status === 'ACTIVE' || (permit.status === 'EXPIRED' && permit.validTo === yesterday),
  );
}

/** The permit as BR-01 reads it: an external one has no status, only its dates. */
function snapshotOf(permitId: string, device: DeviceData): PermitSnapshot | null {
  const platform = device.permits.find((permit) => permit.id === permitId);
  if (platform) {
    return {
      kind: 'PLATFORM',
      status: storedStatus(platform.status),
      validFrom: platform.validFrom,
      validTo: platform.validTo,
      waterIds: platform.waters.map((water) => water.id),
    };
  }
  const external = device.externalPermits.find((permit) => permit.id === permitId);
  return external
    ? {
        kind: 'EXTERNAL',
        validFrom: external.validFrom,
        validTo: external.validTo,
        waterIds: external.waters.map((water) => water.id),
      }
    : null;
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

/**
 * Violations of a catch on the permit `permitId`, as the server would find them now. The rules
 * stored with the permit are those the server checks it against: of the water's owner for a
 * platform permit, the general ones for an external permit.
 */
export function checkOnDevice(
  fish: CatchInput,
  permitId: string,
  device: DeviceData,
  sameDayKept: SameDayCatch[],
  now: Date,
): RuleViolation[] {
  const species = device.species.find((item) => item.id === fish.speciesId);
  const permit = snapshotOf(permitId, device);
  if (!species || !permit) {
    // Only species and permits of the device can be chosen; a stale choice is the server's.
    return [];
  }
  const rule = device.rules
    .get(permitId)
    ?.find((water) => water.waterId === fish.fishingWaterId)
    ?.rules.find((item) => item.speciesId === fish.speciesId);
  return validateCatch({
    catch: fish,
    permit,
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
