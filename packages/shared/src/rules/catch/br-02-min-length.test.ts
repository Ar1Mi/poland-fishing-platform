import { describe, expect, it } from 'vitest';
import { minLengthRule } from './br-02-min-length.js';
import { catchContext } from './catch-context.fixture.js';

const withMinimum = (lengthCm: number, kept = true) =>
  catchContext({ catch: { lengthCm, kept }, effectiveRule: { minLengthCm: 50 } });

describe('BR-02 minimum length', () => {
  it('rejects a kept fish shorter than the minimum', () => {
    expect(minLengthRule.check(withMinimum(49))).toEqual({
      code: 'BELOW_MIN_LENGTH',
      ruleId: 'BR-02',
      details: { minLengthCm: 50 },
    });
  });

  it.each([50, 51])('accepts a kept fish of %i cm', (lengthCm) => {
    expect(minLengthRule.check(withMinimum(lengthCm))).toBe(null);
  });

  it('accepts any length without a minimum', () => {
    expect(minLengthRule.check(catchContext({ catch: { lengthCm: 1 } }))).toBe(null);
  });

  it('does not check a released fish', () => {
    expect(minLengthRule.check(withMinimum(10, false))).toBe(null);
  });
});
