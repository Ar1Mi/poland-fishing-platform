import { describe, expect, it } from 'vitest';
import { assertDateOnly, isInClosedPeriod, warsawDate } from './warsaw.js';

const utc = (iso: string): Date => new Date(`${iso}Z`);

describe('warsawDate', () => {
  it('switches day at Warsaw midnight in winter (UTC+1)', () => {
    expect(warsawDate(utc('2026-01-15T22:59:59.999'))).toBe('2026-01-15');
    expect(warsawDate(utc('2026-01-15T23:00:00'))).toBe('2026-01-16');
  });

  it('switches day at Warsaw midnight in summer (UTC+2)', () => {
    expect(warsawDate(utc('2026-07-10T21:59:59.999'))).toBe('2026-07-10');
    expect(warsawDate(utc('2026-07-10T22:00:00'))).toBe('2026-07-11');
  });

  it('keeps the 23-hour day of the switch to summer time intact', () => {
    expect(warsawDate(utc('2026-03-28T23:00:00'))).toBe('2026-03-29');
    expect(warsawDate(utc('2026-03-29T21:59:59.999'))).toBe('2026-03-29');
    expect(warsawDate(utc('2026-03-29T22:00:00'))).toBe('2026-03-30');
  });

  it('keeps the 25-hour day of the switch to winter time intact', () => {
    expect(warsawDate(utc('2026-10-24T22:00:00'))).toBe('2026-10-25');
    expect(warsawDate(utc('2026-10-25T22:59:59.999'))).toBe('2026-10-25');
    expect(warsawDate(utc('2026-10-25T23:00:00'))).toBe('2026-10-26');
  });

  it('rolls over the year by Warsaw time, not UTC', () => {
    expect(warsawDate(utc('2025-12-31T22:59:59.999'))).toBe('2025-12-31');
    expect(warsawDate(utc('2025-12-31T23:00:00'))).toBe('2026-01-01');
  });

  it('rejects an invalid date', () => {
    expect(() => warsawDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('isInClosedPeriod', () => {
  it('includes both boundary days of a period within one year', () => {
    expect(isInClosedPeriod(utc('2026-03-31T12:00:00'), '04-01', '05-31')).toBe(false);
    expect(isInClosedPeriod(utc('2026-04-01T12:00:00'), '04-01', '05-31')).toBe(true);
    expect(isInClosedPeriod(utc('2026-05-31T12:00:00'), '04-01', '05-31')).toBe(true);
    expect(isInClosedPeriod(utc('2026-06-01T12:00:00'), '04-01', '05-31')).toBe(false);
  });

  it('handles a period that wraps over New Year', () => {
    expect(isInClosedPeriod(utc('2026-11-30T12:00:00'), '12-01', '02-28')).toBe(false);
    expect(isInClosedPeriod(utc('2026-12-01T12:00:00'), '12-01', '02-28')).toBe(true);
    expect(isInClosedPeriod(utc('2026-12-31T12:00:00'), '12-01', '02-28')).toBe(true);
    expect(isInClosedPeriod(utc('2027-01-01T12:00:00'), '12-01', '02-28')).toBe(true);
    expect(isInClosedPeriod(utc('2027-02-28T12:00:00'), '12-01', '02-28')).toBe(true);
    expect(isInClosedPeriod(utc('2027-03-01T12:00:00'), '12-01', '02-28')).toBe(false);
  });

  it('closes Feb 29 whenever Feb 28 is closed', () => {
    const leapDay = utc('2028-02-29T12:00:00');
    expect(isInClosedPeriod(leapDay, '12-01', '02-28')).toBe(true);
    expect(isInClosedPeriod(leapDay, '12-01', '02-29')).toBe(true);
    expect(isInClosedPeriod(leapDay, '02-28', '04-30')).toBe(true);
    expect(isInClosedPeriod(leapDay, '02-29', '04-30')).toBe(true);
    expect(isInClosedPeriod(utc('2028-03-01T12:00:00'), '12-01', '02-28')).toBe(false);
  });

  it('keeps Feb 29 open when Feb 28 is open', () => {
    const leapDay = utc('2028-02-29T12:00:00');
    expect(isInClosedPeriod(leapDay, '03-01', '04-30')).toBe(false);
    expect(isInClosedPeriod(leapDay, '12-01', '02-27')).toBe(false);
  });

  it('uses the Warsaw day at the period boundaries', () => {
    // 23:30 UTC on Mar 31 is already Apr 1 in Warsaw (UTC+2).
    expect(isInClosedPeriod(utc('2026-03-31T23:30:00'), '04-01', '05-31')).toBe(true);
    // 22:30 UTC on May 31 is already Jun 1 in Warsaw.
    expect(isInClosedPeriod(utc('2026-05-31T22:30:00'), '04-01', '05-31')).toBe(false);
    // 23:30 UTC on Dec 31 is already Jan 1 in Warsaw (UTC+1).
    expect(isInClosedPeriod(utc('2026-12-31T23:30:00'), '01-01', '03-31')).toBe(true);
  });

  it('matches a single-day period', () => {
    expect(isInClosedPeriod(utc('2026-05-01T12:00:00'), '05-01', '05-01')).toBe(true);
    expect(isInClosedPeriod(utc('2026-05-02T12:00:00'), '05-01', '05-01')).toBe(false);
  });

  it('rejects a malformed boundary instead of silently never matching', () => {
    const date = utc('2026-05-01T12:00:00');
    expect(() => isInClosedPeriod(date, '5-1', '05-31')).toThrow(RangeError);
    expect(() => isInClosedPeriod(date, '04-01', '13-01')).toThrow(RangeError);
    expect(() => isInClosedPeriod(date, '2026-04-01', '05-31')).toThrow(RangeError);
  });
});

describe('assertDateOnly', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(() => assertDateOnly('2026-07-01')).not.toThrow();
  });

  it.each(['2026-07-01T00:00:00.000Z', '01.07.2026', '2026-7-1', '2026-13-01', ''])(
    'rejects %j',
    (value) => {
      expect(() => assertDateOnly(value)).toThrow(RangeError);
    },
  );
});
