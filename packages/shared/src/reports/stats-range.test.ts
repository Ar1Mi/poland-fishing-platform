import { describe, expect, it } from 'vitest';
import {
  monthsOf,
  seasonRange,
  STATS_RANGE_MAX_DAYS,
  statsRangeBounds,
  statsRangeFormSchema,
  statsRangeIssue,
} from './stats-range.js';

describe('seasonRange', () => {
  it('is the Warsaw calendar year of today', () => {
    expect(seasonRange('2026-10-06')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('refuses anything but a date', () => {
    expect(() => seasonRange('2026-10')).toThrow(RangeError);
  });
});

describe('statsRangeIssue', () => {
  it('accepts one day and a whole leap year', () => {
    expect(statsRangeIssue({ from: '2026-10-06', to: '2026-10-06' })).toBeNull();
    expect(statsRangeIssue({ from: '2028-01-01', to: '2028-12-31' })).toBeNull();
  });

  it(`accepts ${STATS_RANGE_MAX_DAYS} days and refuses one more`, () => {
    expect(statsRangeIssue({ from: '2026-01-01', to: '2027-01-01' })).toBeNull();
    expect(statsRangeIssue({ from: '2026-01-01', to: '2027-01-02' })).toBe('TOO_LONG');
  });

  it('refuses the last day before the first', () => {
    expect(statsRangeIssue({ from: '2026-10-06', to: '2026-10-05' })).toBe('ORDER');
  });

  it('refuses a year outside the catch seasons before anything else', () => {
    expect(statsRangeIssue({ from: '1999-12-31', to: '2026-01-01' })).toBe('OUT_OF_SEASONS');
    expect(statsRangeIssue({ from: '2026-01-01', to: '2101-01-01' })).toBe('OUT_OF_SEASONS');
    expect(statsRangeIssue({ from: '2101-01-02', to: '2101-01-01' })).toBe('OUT_OF_SEASONS');
  });
});

describe('statsRangeBounds', () => {
  it('runs from the Warsaw midnight before the first day to the one after the last', () => {
    expect(statsRangeBounds({ from: '2026-01-01', to: '2026-12-31' })).toEqual({
      start: new Date('2025-12-31T23:00:00.000Z'),
      end: new Date('2026-12-31T23:00:00.000Z'),
    });
  });

  it('follows the clock change: a summer day starts at 22:00 UTC', () => {
    // 29 March 2026 has 23 hours: midnight is still winter time, the next one summer time.
    expect(statsRangeBounds({ from: '2026-03-29', to: '2026-03-29' })).toEqual({
      start: new Date('2026-03-28T23:00:00.000Z'),
      end: new Date('2026-03-29T22:00:00.000Z'),
    });
    // 25 October 2026 has 25 hours.
    expect(statsRangeBounds({ from: '2026-10-25', to: '2026-10-25' })).toEqual({
      start: new Date('2026-10-24T22:00:00.000Z'),
      end: new Date('2026-10-25T23:00:00.000Z'),
    });
  });
});

describe('monthsOf', () => {
  it('lists every month the period touches, the partial first and last ones too', () => {
    expect(monthsOf({ from: '2026-01-31', to: '2026-03-01' })).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('crosses New Year', () => {
    expect(monthsOf({ from: '2025-11-15', to: '2026-02-01' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('is one month for one day and thirteen for the longest period', () => {
    expect(monthsOf({ from: '2026-10-06', to: '2026-10-06' })).toEqual(['2026-10']);
    expect(monthsOf({ from: '2026-01-15', to: '2027-01-15' })).toHaveLength(13);
  });
});

describe('statsRangeFormSchema', () => {
  it('passes a valid period through', () => {
    expect(statsRangeFormSchema.parse({ from: '2026-01-01', to: '2026-12-31' })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('reports a date that does not exist on its field', () => {
    const result = statsRangeFormSchema.safeParse({ from: '2026-02-30', to: '2026-03-01' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['from'], message: 'INVALID' }),
    ]);
  });

  it('reports the window on the last day', () => {
    const result = statsRangeFormSchema.safeParse({ from: '2026-10-06', to: '2026-10-01' });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['to'], message: 'ORDER' }),
    ]);
  });
});
