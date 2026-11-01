import { describe, expect, it } from 'vitest';
import { catchEditableUntil, isCatchEditable } from './br-07-edit-window.js';

const at = (iso: string) => new Date(iso);

describe('BR-07 edit window', () => {
  it('ends 24 hours after the Warsaw midnight that ends the day of the catch', () => {
    // 10:00 CEST on 15 June: the day ends at 22:00 UTC, the window a day later.
    expect(catchEditableUntil(at('2026-06-15T08:00:00.000Z'))).toEqual(
      at('2026-06-16T22:00:00.000Z'),
    );
  });

  it('counts the day of the catch by Warsaw time, not UTC', () => {
    // 23:30 UTC on 15 January is already 16 January in Warsaw (UTC+1).
    expect(catchEditableUntil(at('2026-01-15T23:30:00.000Z'))).toEqual(
      at('2026-01-17T23:00:00.000Z'),
    );
    // 22:59 UTC is still 15 January.
    expect(catchEditableUntil(at('2026-01-15T22:59:59.999Z'))).toEqual(
      at('2026-01-16T23:00:00.000Z'),
    );
  });

  it('is the same for every catch of one Warsaw day', () => {
    const first = catchEditableUntil(at('2026-06-14T22:00:00.000Z')); // 00:00 CEST
    const last = catchEditableUntil(at('2026-06-15T21:59:59.999Z')); // 23:59:59.999 CEST
    expect(first).toEqual(last);
  });

  it('adds 24 hours, not a calendar day, when the next day is the 25-hour switch to winter time', () => {
    // Caught on 24 October (CEST): the day ends at 22:00 UTC; 25 October has 25 hours, so the
    // window closes at 23:00 local time of 25 October, an hour before its midnight.
    expect(catchEditableUntil(at('2026-10-24T10:00:00.000Z'))).toEqual(
      at('2026-10-25T22:00:00.000Z'),
    );
  });

  it('adds 24 hours when the next day is the 23-hour switch to summer time', () => {
    // Caught on 28 March (CET): the day ends at 23:00 UTC; 29 March has 23 hours, so the window
    // closes at 01:00 local time of 30 March.
    expect(catchEditableUntil(at('2026-03-28T10:00:00.000Z'))).toEqual(
      at('2026-03-29T23:00:00.000Z'),
    );
  });

  it('starts from the local midnight of a day of a clock change itself', () => {
    // 25 October (25 hours) ends at 23:00 UTC, in winter time.
    expect(catchEditableUntil(at('2026-10-25T12:00:00.000Z'))).toEqual(
      at('2026-10-26T23:00:00.000Z'),
    );
  });

  it('is open until the last millisecond and closed at the end itself', () => {
    const caughtAt = at('2026-06-15T08:00:00.000Z');
    expect(isCatchEditable(caughtAt, at('2026-06-16T21:59:59.999Z'))).toBe(true);
    expect(isCatchEditable(caughtAt, at('2026-06-16T22:00:00.000Z'))).toBe(false);
  });

  it('is open right after the catch and for a catch the clock has not reached yet', () => {
    const caughtAt = at('2026-06-15T08:00:00.000Z');
    expect(isCatchEditable(caughtAt, caughtAt)).toBe(true);
    expect(isCatchEditable(caughtAt, at('2026-06-15T07:00:00.000Z'))).toBe(true);
  });

  it('rejects an invalid date instead of answering', () => {
    expect(() => catchEditableUntil(new Date(Number.NaN))).toThrow(RangeError);
  });
});
