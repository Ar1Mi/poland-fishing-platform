import { z } from 'zod';
import { CATCH_SEASONS } from '../catches/catch-input.js';
import { addDays } from '../permits/purchase.js';
import { assertDateOnly, type DateOnly, warsawDayEnd } from '../time/warsaw.js';

// The period of the organization's statistics and catch export (FR-19): Warsaw calendar days,
// both inclusive, shared by the API (query check) and the period form of the statistics page.

/** At most one season, a leap year included: bounds the work of one report. */
export const STATS_RANGE_MAX_DAYS = 366;

/** Calendar days `from`…`to`, both inclusive. */
export interface StatsRange {
  from: DateOnly;
  to: DateOnly;
}

/** The season (Warsaw calendar year) of `today`: the period shown when none is asked for. */
export function seasonRange(today: DateOnly): StatsRange {
  assertDateOnly(today);
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Why a period is refused; the form translates these, the API reports them on `to`. */
export const StatsRangeIssue = {
  /** A day outside `CATCH_SEASONS`: no catch can be there, and a typo in the year is likely. */
  OUT_OF_SEASONS: 'OUT_OF_SEASONS',
  /** The last day is before the first. */
  ORDER: 'ORDER',
  /** Longer than `STATS_RANGE_MAX_DAYS`. */
  TOO_LONG: 'TOO_LONG',
} as const;
export type StatsRangeIssue = (typeof StatsRangeIssue)[keyof typeof StatsRangeIssue];

const yearOf = (date: DateOnly): number => Number(date.slice(0, 4));

/**
 * The first broken rule of the period, or null. `from` and `to` are calendar dates, checked
 * before (`z.iso.date()`, `@IsISO8601({ strict: true })`).
 */
export function statsRangeIssue({ from, to }: StatsRange): StatsRangeIssue | null {
  const inSeasons = (date: DateOnly) =>
    yearOf(date) >= CATCH_SEASONS.FIRST && yearOf(date) <= CATCH_SEASONS.LAST;
  if (!inSeasons(from) || !inSeasons(to)) {
    return StatsRangeIssue.OUT_OF_SEASONS;
  }
  if (to < from) {
    return StatsRangeIssue.ORDER;
  }
  if (to >= addDays(from, STATS_RANGE_MAX_DAYS)) {
    return StatsRangeIssue.TOO_LONG;
  }
  return null;
}

/**
 * The instants of the period for a query `start <= t < end`: from the Warsaw midnight that
 * begins `from` to the one that ends `to` — 23, 24 or 25 hours a day, as the clocks change.
 */
export function statsRangeBounds({ from, to }: StatsRange): { start: Date; end: Date } {
  return { start: warsawDayEnd(addDays(from, -1)), end: warsawDayEnd(to) };
}

/** Calendar month `YYYY-MM`. */
export type YearMonth = string;

/** The months the period touches, in order: the buckets of the sales chart, empty ones too. */
export function monthsOf({ from, to }: StatsRange): YearMonth[] {
  assertDateOnly(from);
  assertDateOnly(to);
  const months: YearMonth[] = [];
  let year = yearOf(from);
  let month = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (;;) {
    const current = `${year}-${String(month).padStart(2, '0')}`;
    if (current > last) {
      return months;
    }
    months.push(current);
    month = (month % 12) + 1;
    year = month === 1 ? year + 1 : year;
  }
}

const calendarDate = z.iso.date();

/** Issue message of a field of `statsRangeFormSchema` that is not a date at all. */
export const StatsRangeFieldIssue = { INVALID: 'INVALID' } as const;

/** The period form; the window's issue is reported on `to`, with a `StatsRangeIssue`. */
export const statsRangeFormSchema = z
  .object({
    from: z.iso.date({ message: StatsRangeFieldIssue.INVALID }),
    to: z.iso.date({ message: StatsRangeFieldIssue.INVALID }),
  })
  .superRefine((range, context) => {
    // It runs despite the issues of the fields: the window is checked only on real dates.
    if (!calendarDate.safeParse(range.from).success || !calendarDate.safeParse(range.to).success) {
      return;
    }
    const issue = statsRangeIssue(range);
    if (issue) {
      context.addIssue({ code: 'custom', path: ['to'], message: issue });
    }
  });
export type StatsRangeFormValues = z.input<typeof statsRangeFormSchema>;
