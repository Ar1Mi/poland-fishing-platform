import { PermitStatus } from '../../enums.js';
import type { EffectiveRule } from '../species-rules.js';
import type { CatchContext, CatchInput, PermitSnapshot, SameDayCatch } from './types.js';

// Test data of the catch rules; excluded from the build and from coverage.

export const PIKE = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f';
export const PERCH = '7e8f9a0b-1c2d-4e3f-8a5b-6c7d8e9f0a1b';
export const WATER = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
export const OTHER_WATER = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

/** 10:00 in Warsaw (CEST, UTC+2), inside the default permit. */
export const CAUGHT_AT = new Date('2026-06-15T08:00:00.000Z');

type PlatformPermit = Extract<PermitSnapshot, { kind: 'PLATFORM' }>;
type ExternalPermit = Extract<PermitSnapshot, { kind: 'EXTERNAL' }>;

/** A paid platform permit for June 2026 on `WATER`. */
export function platformPermit(fields: Partial<Omit<PlatformPermit, 'kind'>> = {}): PlatformPermit {
  return {
    kind: 'PLATFORM',
    status: PermitStatus.PAID,
    validFrom: '2026-06-01',
    validTo: '2026-06-30',
    waterIds: [WATER],
    ...fields,
  };
}

/** A permit bought outside the platform, for June 2026 on `WATER`. */
export function externalPermit(fields: Partial<Omit<ExternalPermit, 'kind'>> = {}): ExternalPermit {
  return {
    kind: 'EXTERNAL',
    validFrom: '2026-06-01',
    validTo: '2026-06-30',
    waterIds: [WATER],
    ...fields,
  };
}

/** Another kept pike of the user, earlier on the day of `CAUGHT_AT`. */
export function keptEarlier(fields: Partial<SameDayCatch> = {}): SameDayCatch {
  return {
    speciesId: PIKE,
    caughtAt: new Date('2026-06-15T06:00:00.000Z'),
    weightG: 1000,
    kept: true,
    ...fields,
  };
}

export interface ContextOverrides {
  catch?: Partial<CatchInput>;
  permit?: PermitSnapshot;
  species?: Partial<CatchContext['species']>;
  effectiveRule?: Partial<EffectiveRule>;
  sameDayKept?: SameDayCatch[];
  now?: Date;
}

/**
 * A kept 60 cm, 2 kg pike caught at `CAUGHT_AT` on a water of an active platform permit, with no
 * rule for pike and nothing kept before; checked an hour after the catch.
 */
export function catchContext(overrides: ContextOverrides = {}): CatchContext {
  const fish: CatchInput = {
    speciesId: PIKE,
    fishingWaterId: WATER,
    caughtAt: CAUGHT_AT,
    lengthCm: 60,
    weightG: 2000,
    kept: true,
    ...overrides.catch,
  };
  return {
    catch: fish,
    permit: overrides.permit ?? platformPermit(),
    species: { id: fish.speciesId, isProtected: false, ...overrides.species },
    effectiveRule: {
      minLengthCm: null,
      dailyLimitCount: null,
      dailyLimitWeightG: null,
      closedPeriods: [],
      ...overrides.effectiveRule,
    },
    sameDayKept: overrides.sameDayKept ?? [],
    now: overrides.now ?? new Date(fish.caughtAt.getTime() + 60 * 60_000),
  };
}
