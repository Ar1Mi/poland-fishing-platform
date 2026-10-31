import { describe, expect, it } from 'vitest';
import { dailyWeightRule } from './br-05-daily-weight.js';
import { catchContext, otherKept, PERCH } from './catch-context.fixture.js';
import type { SameDayCatch } from './types.js';

const check = (
  limitG: number,
  weightG: number | null,
  sameDayKept: SameDayCatch[] = [],
  kept = true,
) =>
  dailyWeightRule.check(
    catchContext({
      catch: { weightG, kept },
      effectiveRule: { dailyLimitWeightG: limitG },
      sameDayKept,
    }),
  );

describe('BR-05 daily weight limit', () => {
  it('accepts the fish that reaches the limit', () => {
    expect(check(3000, 2000, [otherKept({ weightG: 1000 })])).toBe(null);
  });

  it('rejects the fish over the limit', () => {
    expect(check(3000, 2000, [otherKept({ weightG: 1001 })])).toEqual({
      code: 'DAILY_WEIGHT_LIMIT',
      ruleId: 'BR-05',
      details: { limitG: 3000, alreadyKeptG: 1001 },
    });
  });

  it('counts an earlier catch without a weight as 0 g', () => {
    expect(check(2000, 2000, [otherKept({ weightG: null })])).toBe(null);
  });

  it('counts only kept fish of the species on the same Warsaw day', () => {
    const sameDayKept = [
      otherKept({ weightG: 500 }),
      otherKept({ speciesId: PERCH }),
      otherKept({ kept: false }),
      otherKept({ caughtAt: new Date('2026-06-14T21:59:59.999Z') }),
      otherKept({ caughtAt: new Date('2026-06-15T22:00:00.000Z') }),
    ];

    expect(check(2500, 2000, sameDayKept)).toBe(null);
    expect(check(2499, 2000, sameDayKept)?.details).toEqual({ limitG: 2499, alreadyKeptG: 500 });
  });

  describe('without the weight of the checked fish', () => {
    it('leaves the fish to BR-11 while the limit is not reached', () => {
      expect(check(3000, null, [otherKept({ weightG: 2999 })])).toBe(null);
    });

    it('rejects the fish once the limit is reached', () => {
      expect(check(3000, null, [otherKept({ weightG: 3000 })])?.code).toBe('DAILY_WEIGHT_LIMIT');
    });

    it('rejects every kept fish at a limit of 0 (no-kill)', () => {
      expect(check(0, null)?.details).toEqual({ limitG: 0, alreadyKeptG: 0 });
    });
  });

  it('rejects a weighed fish at a limit of 0 (no-kill)', () => {
    expect(check(0, 300)?.code).toBe('DAILY_WEIGHT_LIMIT');
  });

  it('accepts any weight without a limit', () => {
    expect(dailyWeightRule.check(catchContext({ catch: { weightG: 99_000 } }))).toBe(null);
  });

  it('does not check a released fish', () => {
    expect(check(0, 5000, [], false)).toBe(null);
  });
});
