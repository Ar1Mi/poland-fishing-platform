export const WARSAW_TIME_ZONE = 'Europe/Warsaw';

/** Calendar date without time, `YYYY-MM-DD`. */
export type DateOnly = string;

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

// Intl ships with both Node and browsers, so the package needs no timezone dependency.
const warsawFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: WARSAW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day of the instant in Europe/Warsaw — the business "day" of BR-04, BR-05, BR-07. */
export function warsawDate(date: Date): DateOnly {
  const parts = warsawFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Whether the Warsaw calendar day of `date` falls into the yearly closed period (okres ochronny).
 * `from` and `to` are `MM-DD`, both inclusive; `from > to` means the period wraps over New Year.
 */
export function isInClosedPeriod(date: Date, from: string, to: string): boolean {
  if (!MONTH_DAY.test(from) || !MONTH_DAY.test(to)) {
    throw new RangeError(`Closed period must be MM-DD, got "${from}"…"${to}"`);
  }
  const monthDay = warsawDate(date).slice(5);
  return from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;
}
