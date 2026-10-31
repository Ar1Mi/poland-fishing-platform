import { describe, expect, it } from 'vitest';
import { dailyCountRule } from './br-04-daily-count.js';
import { catchContext, keptEarlier, PERCH } from './catch-context.fixture.js';
import type { SameDayCatch } from './types.js';

const withLimit = (limit: number, sameDayKept: SameDayCatch[], kept = true) =>
  catchContext({ catch: { kept }, effectiveRule: { dailyLimitCount: limit }, sameDayKept });

describe('BR-04 daily count limit', () => {
  it('accepts the fish that reaches the limit', () => {
    expect(dailyCountRule.check(withLimit(2, [keptEarlier()]))).toBe(null);
  });

  it('rejects the fish over the limit', () => {
    expect(dailyCountRule.check(withLimit(2, [keptEarlier(), keptEarlier()]))).toEqual({
      code: 'DAILY_COUNT_LIMIT',
      ruleId: 'BR-04',
      details: { limit: 2, alreadyKept: 2 },
    });
  });

  it('rejects every kept fish at a limit of 0 (no-kill)', () => {
    expect(dailyCountRule.check(withLimit(0, []))?.details).toEqual({ limit: 0, alreadyKept: 0 });
  });

  // The checked pike is caught at 10:00 on 2026-06-15 in Warsaw (UTC+2).
  it('counts only kept fish of the species on the same Warsaw day', () => {
    const sameDayKept = [
      keptEarlier({ speciesId: PERCH }),
      keptEarlier({ kept: false }),
      keptEarlier({ caughtAt: new Date('2026-06-14T21:59:59.999Z') }),
      keptEarlier({ caughtAt: new Date('2026-06-15T21:00:00.000Z') }),
      keptEarlier({ caughtAt: new Date('2026-06-14T22:00:00.000Z') }),
    ];

    expect(dailyCountRule.check(withLimit(1, sameDayKept))?.details).toEqual({
      limit: 1,
      alreadyKept: 2,
    });
    expect(dailyCountRule.check(withLimit(3, sameDayKept))).toBe(null);
  });

  it('accepts any number without a limit', () => {
    expect(dailyCountRule.check(catchContext({ sameDayKept: [keptEarlier()] }))).toBe(null);
  });

  it('does not check a released fish', () => {
    expect(dailyCountRule.check(withLimit(0, [keptEarlier()], false))).toBe(null);
  });
});
