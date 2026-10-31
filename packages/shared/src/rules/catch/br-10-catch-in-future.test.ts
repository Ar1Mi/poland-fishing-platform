import { describe, expect, it } from 'vitest';
import { catchInFutureRule } from './br-10-catch-in-future.js';
import { CAUGHT_AT, catchContext } from './catch-context.fixture.js';

const checkedBefore = (ms: number, kept = true) =>
  catchInFutureRule.check(
    catchContext({ catch: { kept }, now: new Date(CAUGHT_AT.getTime() - ms) }),
  );

describe('BR-10 catch in the future', () => {
  it('accepts a catch up to 5 minutes ahead of the clock', () => {
    expect(checkedBefore(5 * 60_000)).toBe(null);
  });

  it('rejects a catch more than 5 minutes ahead', () => {
    expect(checkedBefore(5 * 60_000 + 1)).toEqual({
      code: 'CATCH_IN_FUTURE',
      ruleId: 'BR-10',
      details: { toleranceMinutes: 5 },
    });
  });

  it('accepts a catch in the past', () => {
    expect(catchInFutureRule.check(catchContext())).toBe(null);
  });

  it('checks a released fish too', () => {
    expect(checkedBefore(60 * 60_000, false)?.code).toBe('CATCH_IN_FUTURE');
  });
});
