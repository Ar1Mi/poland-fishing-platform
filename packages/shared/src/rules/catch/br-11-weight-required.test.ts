import { describe, expect, it } from 'vitest';
import { weightRequiredRule } from './br-11-weight-required.js';
import { catchContext } from './catch-context.fixture.js';

const check = (dailyLimitWeightG: number | null, weightG: number | null, kept = true) =>
  weightRequiredRule.check(
    catchContext({ catch: { weightG, kept }, effectiveRule: { dailyLimitWeightG } }),
  );

describe('BR-11 weight required', () => {
  it.each([5000, 0])('rejects a kept fish without weight at a weight limit of %i g', (limit) => {
    expect(check(limit, null)).toEqual({ code: 'WEIGHT_REQUIRED', ruleId: 'BR-11' });
  });

  it('accepts a weighed fish', () => {
    expect(check(5000, 1200)).toBe(null);
  });

  it('accepts a fish without weight when no weight limit applies', () => {
    expect(check(null, null)).toBe(null);
  });

  it('does not check a released fish', () => {
    expect(check(5000, null, false)).toBe(null);
  });
});
