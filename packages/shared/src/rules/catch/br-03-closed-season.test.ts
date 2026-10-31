import { describe, expect, it } from 'vitest';
import type { ClosedPeriod } from '../species-rules.js';
import { closedSeasonRule } from './br-03-closed-season.js';
import { catchContext } from './catch-context.fixture.js';

const check = (caughtAt: string, closedPeriods: ClosedPeriod[], kept = true) =>
  closedSeasonRule.check(
    catchContext({
      catch: { caughtAt: new Date(caughtAt), kept },
      effectiveRule: { closedPeriods },
    }),
  );

describe('BR-03 closed season', () => {
  const june = { from: '06-01', to: '06-15' };

  it('rejects a kept fish in the period', () => {
    expect(check('2026-06-10T08:00:00.000Z', [june])).toEqual({
      code: 'CLOSED_SEASON',
      ruleId: 'BR-03',
      details: { from: '06-01', to: '06-15' },
    });
  });

  // Warsaw is UTC+2 in June: its days start at 22:00 UTC of the day before.
  it.each([
    ['the last minute before it', '2026-05-31T21:59:59.999Z', false],
    ['its first Warsaw day', '2026-05-31T22:00:00.000Z', true],
    ['its last Warsaw day', '2026-06-15T21:59:59.999Z', true],
    ['the first minute after it', '2026-06-15T22:00:00.000Z', false],
  ])('includes both days of the period: %s', (_, caughtAt, closed) => {
    expect(check(caughtAt, [june]) !== null).toBe(closed);
  });

  // Warsaw is UTC+1 in winter.
  it.each([
    ['in December', '2026-12-31T22:59:59.999Z', true],
    ['in January', '2026-12-31T23:00:00.000Z', true],
    ['on 29 February of a leap year', '2028-02-29T11:00:00.000Z', true],
    ['on 1 March', '2027-02-28T23:00:00.000Z', false],
    ['on 30 November', '2026-11-30T11:00:00.000Z', false],
  ])('applies a period over New Year %s', (_, caughtAt, closed) => {
    expect(check(caughtAt, [{ from: '12-01', to: '02-28' }]) !== null).toBe(closed);
  });

  it('reports the first period the day falls into', () => {
    const periods = [{ from: '01-01', to: '04-30' }, june, { from: '06-10', to: '07-31' }];

    expect(check('2026-06-12T08:00:00.000Z', periods)?.details).toEqual(june);
    expect(check('2026-08-01T08:00:00.000Z', periods)).toBe(null);
  });

  it('accepts any day without periods', () => {
    expect(check('2026-06-10T08:00:00.000Z', [])).toBe(null);
  });

  it('does not check a released fish', () => {
    expect(check('2026-06-10T08:00:00.000Z', [june], false)).toBe(null);
  });
});
