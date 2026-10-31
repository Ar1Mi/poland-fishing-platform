import { describe, expect, it } from 'vitest';
import {
  assertDateOnly,
  fromWarsawDateTimeLocal,
  isInClosedPeriod,
  warsawDate,
  warsawDateTimeLocal,
  warsawDayEnd,
} from './warsaw.js';

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

describe('warsawDayEnd', () => {
  it('ends a winter day at 23:00 UTC', () => {
    expect(warsawDayEnd('2026-01-15')).toEqual(utc('2026-01-15T23:00:00'));
  });

  it('ends a summer day at 22:00 UTC', () => {
    expect(warsawDayEnd('2026-07-10')).toEqual(utc('2026-07-10T22:00:00'));
  });

  it('ends the days around the switch to summer time at their own local midnight', () => {
    expect(warsawDayEnd('2026-03-28')).toEqual(utc('2026-03-28T23:00:00'));
    expect(warsawDayEnd('2026-03-29')).toEqual(utc('2026-03-29T22:00:00'));
  });

  it('ends the days around the switch to winter time at their own local midnight', () => {
    expect(warsawDayEnd('2026-10-24')).toEqual(utc('2026-10-24T22:00:00'));
    expect(warsawDayEnd('2026-10-25')).toEqual(utc('2026-10-25T23:00:00'));
  });

  it("ends New Year's Eve and the last day of February in the next month or year", () => {
    expect(warsawDayEnd('2026-12-31')).toEqual(utc('2026-12-31T23:00:00'));
    expect(warsawDayEnd('2028-02-29')).toEqual(utc('2028-02-29T23:00:00'));
  });

  it('is the first instant whose Warsaw date is the next day', () => {
    for (const date of ['2026-03-29', '2026-10-25', '2026-06-01']) {
      const end = warsawDayEnd(date).getTime();
      expect(warsawDate(new Date(end - 1))).toBe(date);
      expect(warsawDate(new Date(end))).not.toBe(date);
    }
  });

  it('rejects a malformed date', () => {
    expect(() => warsawDayEnd('2026-7-1')).toThrow(RangeError);
  });
});

describe('warsawDateTimeLocal', () => {
  it('shows the Warsaw wall clock to the minute in winter and summer', () => {
    expect(warsawDateTimeLocal(utc('2026-01-15T13:20:59.999'))).toBe('2026-01-15T14:20');
    expect(warsawDateTimeLocal(utc('2026-06-15T13:20:00'))).toBe('2026-06-15T15:20');
  });

  it('shows midnight as 00:00 of the next Warsaw day', () => {
    expect(warsawDateTimeLocal(utc('2026-12-31T23:00:00'))).toBe('2027-01-01T00:00');
  });
});

describe('fromWarsawDateTimeLocal', () => {
  it('reads Warsaw wall-clock time in winter (UTC+1) and summer (UTC+2)', () => {
    expect(fromWarsawDateTimeLocal('2026-01-15T14:20')).toEqual(utc('2026-01-15T13:20:00'));
    expect(fromWarsawDateTimeLocal('2026-06-15T15:20')).toEqual(utc('2026-06-15T13:20:00'));
  });

  it('reads the minutes around the switch to summer time and skips the missing hour', () => {
    expect(fromWarsawDateTimeLocal('2026-03-29T01:59')).toEqual(utc('2026-03-29T00:59:00'));
    expect(fromWarsawDateTimeLocal('2026-03-29T02:30')).toBe(null);
    expect(fromWarsawDateTimeLocal('2026-03-29T03:00')).toEqual(utc('2026-03-29T01:00:00'));
  });

  it('takes the first of the twice-occurring hour of the switch to winter time', () => {
    expect(fromWarsawDateTimeLocal('2026-10-25T02:30')).toEqual(utc('2026-10-25T00:30:00'));
    expect(fromWarsawDateTimeLocal('2026-10-25T03:00')).toEqual(utc('2026-10-25T02:00:00'));
  });

  it('round-trips with warsawDateTimeLocal', () => {
    for (const text of ['2026-02-28T23:59', '2028-02-29T00:00', '2026-10-25T01:59']) {
      expect(warsawDateTimeLocal(fromWarsawDateTimeLocal(text)!)).toBe(text);
    }
  });

  it('rejects malformed and non-existent dates and times', () => {
    for (const text of [
      '',
      '2026-06-15',
      '2026-06-15 10:00',
      '2026-06-15T24:00',
      '2026-02-29T10:00',
      '2026-13-01T10:00',
      '2026-06-15T10:00:00',
    ]) {
      expect(fromWarsawDateTimeLocal(text)).toBe(null);
    }
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
