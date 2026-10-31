export const WARSAW_TIME_ZONE = 'Europe/Warsaw';

/** Calendar date without time, `YYYY-MM-DD`. */
export type DateOnly = string;

const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
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
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) throw new RangeError(`Cannot format ${type} in ${WARSAW_TIME_ZONE}`);
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const warsawDateTimeFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: WARSAW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** How far Warsaw wall-clock time is ahead of UTC at the instant: 1 h in winter, 2 h in summer. */
function warsawOffsetMs(instant: number): number {
  const parts = warsawDateTimeFormat.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return wallClockAsUtc - (instant - (instant % 1000));
}

/**
 * The instant the Warsaw calendar day `date` ends (the next local midnight, exclusive): the expiry
 * of a QR token for a permit valid through `date` (ADR-0006).
 */
export function warsawDayEnd(date: DateOnly): Date {
  assertDateOnly(date);
  const nextMidnightAsUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)) + 1,
  );
  // Warsaw changes its offset at 01:00 UTC, so at 00:00 UTC it is still the offset of local midnight.
  return new Date(nextMidnightAsUtc - warsawOffsetMs(nextMidnightAsUtc));
}

/** Warsaw wall-clock time `YYYY-MM-DDTHH:mm`, the value of an `<input type="datetime-local">`. */
export type WarsawDateTimeLocal = string;

const DATE_TIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

/** The instant as Warsaw wall-clock time to the minute (seconds are dropped). */
export function warsawDateTimeLocal(date: Date): WarsawDateTimeLocal {
  const parts = warsawDateTimeFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) throw new RangeError(`Cannot format ${type} in ${WARSAW_TIME_ZONE}`);
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/**
 * The instant of a Warsaw wall-clock time, or `null` if there is none: a malformed or
 * non-existent date, or a time skipped by the switch to summer time (02:00–02:59 on the last
 * Sunday of March). A time that occurs twice (02:00–02:59 on the last Sunday of October) is the
 * first one, still in summer time.
 */
export function fromWarsawDateTimeLocal(text: string): Date | null {
  const match = DATE_TIME_LOCAL.exec(text);
  if (!match) {
    return null;
  }
  const part = (index: number): number => Number(match[index]);
  const wallClockAsUtc = Date.UTC(part(1), part(2) - 1, part(3), part(4), part(5));
  // Warsaw is 1 or 2 hours ahead of UTC; whichever offset reproduces the wall clock is right.
  const candidates = [2, 1]
    .map((hours) => new Date(wallClockAsUtc - hours * 3_600_000))
    .filter((instant) => warsawDateTimeLocal(instant) === text);
  return candidates[0] ?? null;
}

/** Guards string comparison of dates: anything but `YYYY-MM-DD` would compare silently wrong. */
export function assertDateOnly(value: string): asserts value is DateOnly {
  if (!DATE_ONLY.test(value)) throw new RangeError(`Expected YYYY-MM-DD, got "${value}"`);
}

/**
 * Whether the Warsaw calendar day of `date` falls into the yearly closed period (okres ochronny).
 * `from` and `to` are `MM-DD`, both inclusive; `from > to` means the period wraps over New Year.
 * Feb 29 is closed whenever Feb 28 is, so a period ending `02-28` covers the whole of February.
 */
export function isInClosedPeriod(date: Date, from: string, to: string): boolean {
  if (!MONTH_DAY.test(from) || !MONTH_DAY.test(to)) {
    throw new RangeError(`Closed period must be MM-DD, got "${from}"…"${to}"`);
  }
  const contains = (monthDay: string): boolean =>
    from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;

  const monthDay = warsawDate(date).slice(5);
  return contains(monthDay) || (monthDay === '02-29' && contains('02-28'));
}
