import { warsawDate, warsawDayEnd } from '../../time/warsaw.js';

// BR-07: a stored catch is edited or deleted until the end of its Warsaw day plus 24 hours.
// Not a `CatchRule`: it limits changing a stored catch (`EDIT_WINDOW_CLOSED`), not the catch.

/** How long after the end of the day of the catch it can still be changed. */
export const CATCH_EDIT_GRACE_HOURS = 24;

/**
 * The first instant the catch can no longer be changed: the next Warsaw midnight after
 * `caughtAt` plus 24 hours — literally, so after a day of a clock change it is 23:00 or 01:00
 * local time, not midnight (docs/02-business-rules.md → «Уточнения (T-18)»).
 */
export function catchEditableUntil(caughtAt: Date): Date {
  const dayEnd = warsawDayEnd(warsawDate(caughtAt));
  return new Date(dayEnd.getTime() + CATCH_EDIT_GRACE_HOURS * 3_600_000);
}

/** Whether a catch of `caughtAt` can be edited or deleted at `now`. */
export function isCatchEditable(caughtAt: Date, now: Date): boolean {
  return now.getTime() < catchEditableUntil(caughtAt).getTime();
}
