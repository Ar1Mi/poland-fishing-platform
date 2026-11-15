import { assertDateOnly, type DateOnly } from './warsaw.js';

// Calendar arithmetic on `YYYY-MM-DD` dates (permits, reminders). Its own module, without
// zod: the first screen of the app imports `addDays` and must not carry the schemas (T-29).

/** A `YYYY-MM-DD` that exists: Date arithmetic would silently roll `02-30` over into March. */
export function assertCalendarDate(date: string): asserts date is DateOnly {
  assertDateOnly(date);
  if (new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Not a calendar date: "${date}"`);
  }
}

/** `date` moved by `days` calendar days; UTC arithmetic, so no daylight saving shift. */
export function addDays(date: DateOnly, days: number): DateOnly {
  assertCalendarDate(date);
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}
