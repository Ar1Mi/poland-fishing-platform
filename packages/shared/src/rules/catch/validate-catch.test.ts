import { describe, expect, it } from 'vitest';
import { minLengthRule } from './br-02-min-length.js';
import {
  CAUGHT_AT,
  catchContext,
  keptEarlier,
  OTHER_WATER,
  PERCH,
  platformPermit,
} from './catch-context.fixture.js';
import { validateCatch } from './validate-catch.js';

const codes = (...args: Parameters<typeof validateCatch>) =>
  validateCatch(...args).map((violation) => violation.code);

/** A kept pike that breaks every rule at once. */
const everythingWrong = (kept: boolean) =>
  catchContext({
    catch: { kept, fishingWaterId: OTHER_WATER, lengthCm: 40, weightG: null },
    permit: platformPermit({ validTo: '2026-06-14' }),
    species: { isProtected: true },
    effectiveRule: {
      minLengthCm: 50,
      dailyLimitCount: 1,
      dailyLimitWeightG: 1000,
      closedPeriods: [{ from: '06-01', to: '06-30' }],
    },
    sameDayKept: [keptEarlier({ weightG: 1000 })],
    now: new Date(CAUGHT_AT.getTime() - 60 * 60_000),
  });

describe('validateCatch', () => {
  it('accepts a catch that breaks no rule', () => {
    expect(validateCatch(catchContext())).toEqual([]);
  });

  it('reports every violation of a kept fish in the order of the rules', () => {
    expect(codes(everythingWrong(true))).toEqual([
      'PERMIT_NOT_ACTIVE',
      'PERMIT_WATER_MISMATCH',
      'BELOW_MIN_LENGTH',
      'CLOSED_SEASON',
      'DAILY_COUNT_LIMIT',
      'DAILY_WEIGHT_LIMIT',
      'PROTECTED_SPECIES',
      'CATCH_IN_FUTURE',
      'WEIGHT_REQUIRED',
    ]);
  });

  it('checks a released fish only by BR-01, BR-06 and BR-10', () => {
    expect(validateCatch(everythingWrong(false)).map((violation) => violation.ruleId)).toEqual([
      'BR-01',
      'BR-01',
      'BR-10',
    ]);
  });

  it('accepts only the release of a protected species', () => {
    const released = catchContext({ catch: { kept: false }, species: { isProtected: true } });
    const kept = catchContext({ species: { isProtected: true } });

    expect(validateCatch(released)).toEqual([]);
    expect(codes(kept)).toEqual(['PROTECTED_SPECIES']);
  });

  it('runs only the given rules', () => {
    expect(codes(everythingWrong(true), [minLengthRule])).toEqual(['BELOW_MIN_LENGTH']);
    expect(validateCatch(everythingWrong(true), [])).toEqual([]);
  });

  it('refuses a species that is not the one of the catch', () => {
    const ctx = { ...catchContext(), species: { id: PERCH, isProtected: false } };

    expect(() => validateCatch(ctx)).toThrow(RangeError);
  });

  describe('Warsaw midnight', () => {
    // A one-day permit on 31 October 2026, after the change to winter time (UTC+1).
    const oneDay = platformPermit({ validFrom: '2026-10-31', validTo: '2026-10-31' });
    const at = (caughtAt: string) =>
      codes(catchContext({ catch: { caughtAt: new Date(caughtAt) }, permit: oneDay }));

    it('keeps a one-day permit active until the Warsaw midnight, not the UTC one', () => {
      expect(at('2026-10-30T23:00:00.000Z')).toEqual([]);
      expect(at('2026-10-31T22:59:59.999Z')).toEqual([]);
      expect(at('2026-10-30T22:59:59.999Z')).toEqual(['PERMIT_NOT_ACTIVE']);
      expect(at('2026-10-31T23:00:00.000Z')).toEqual(['PERMIT_NOT_ACTIVE']);
    });

    it('starts a new daily limit at the Warsaw midnight', () => {
      const ctx = catchContext({
        catch: { caughtAt: new Date('2026-10-30T23:00:00.000Z') },
        permit: platformPermit({ validFrom: '2026-10-01', validTo: '2026-10-31' }),
        effectiveRule: { dailyLimitCount: 1 },
        sameDayKept: [keptEarlier({ caughtAt: new Date('2026-10-30T22:59:59.999Z') })],
      });

      expect(validateCatch(ctx)).toEqual([]);
    });
  });

  describe('daylight saving time', () => {
    const october = platformPermit({ validFrom: '2026-10-01', validTo: '2026-10-31' });
    const march = platformPermit({ validFrom: '2026-03-01', validTo: '2026-03-31' });
    const secondOf = (permit: typeof october, first: string, second: string) =>
      codes(
        catchContext({
          catch: { caughtAt: new Date(second) },
          permit,
          effectiveRule: { dailyLimitCount: 1 },
          sameDayKept: [keptEarlier({ caughtAt: new Date(first) })],
        }),
      );

    // 25 October 2026 lasts 25 hours in Warsaw: 22:00 UTC on the 24th to 23:00 UTC on the 25th.
    it('counts 00:30 and 23:30 of the day winter time starts as one day, 24 hours apart', () => {
      expect(secondOf(october, '2026-10-24T22:30:00.000Z', '2026-10-25T22:30:00.000Z')).toEqual([
        'DAILY_COUNT_LIMIT',
      ]);
      expect(secondOf(october, '2026-10-24T22:30:00.000Z', '2026-10-25T23:00:00.000Z')).toEqual([]);
    });

    // 29 March 2026 lasts 23 hours in Warsaw: 23:00 UTC on the 28th to 22:00 UTC on the 29th.
    it('ends the day summer time starts at 22:00 UTC', () => {
      expect(secondOf(march, '2026-03-28T23:00:00.000Z', '2026-03-29T21:59:59.999Z')).toEqual([
        'DAILY_COUNT_LIMIT',
      ]);
      expect(secondOf(march, '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z')).toEqual([]);
    });
  });

  describe('closed period over New Year', () => {
    // A permit for December 2026 and a period 12-01…02-28; Warsaw is UTC+1.
    const december = platformPermit({ validFrom: '2026-12-01', validTo: '2026-12-31' });
    const at = (caughtAt: string, kept = true) =>
      codes(
        catchContext({
          catch: { caughtAt: new Date(caughtAt), kept },
          permit: december,
          effectiveRule: { closedPeriods: [{ from: '12-01', to: '02-28' }] },
          now: new Date('2027-01-01T12:00:00.000Z'),
        }),
      );

    it('closes both sides of New Year and ends the permit at the Warsaw midnight', () => {
      expect(at('2026-12-31T22:59:59.999Z')).toEqual(['CLOSED_SEASON']);
      expect(at('2026-12-31T23:00:00.000Z')).toEqual(['PERMIT_NOT_ACTIVE', 'CLOSED_SEASON']);
    });

    it('lets a fish caught in the period be released', () => {
      expect(at('2026-12-15T10:00:00.000Z', false)).toEqual([]);
    });
  });
});
