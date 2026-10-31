import { describe, expect, it } from 'vitest';
import { parsePriceGrosze } from '@lowisko/shared';
import {
  formatDate,
  formatDateTime,
  formatDayWithWeekday,
  formatPrice,
  formatPriceInput,
  formatTime,
} from './format';

describe('formatDate', () => {
  it('uses the calendar day in Warsaw, not in UTC', () => {
    // 23:30 UTC on 24 October is already 25 October in Warsaw (CEST, UTC+2).
    expect(formatDate('2026-10-24T23:30:00Z', 'pl')).toBe('25 paź 2026');
  });

  it('handles the change to winter time', () => {
    // 25 October 2026 23:30 UTC is 00:30 on 26 October in Warsaw (CET, UTC+1).
    expect(formatDate('2026-10-25T23:30:00Z', 'en')).toBe('Oct 26, 2026');
  });
});

describe('formatPrice', () => {
  it('shows grosze as złoty in the interface language', () => {
    // Intl separates the currency with a non-breaking space.
    expect(formatPrice(2550, 'pl').replace(/\s/g, ' ')).toBe('25,50 zł');
    expect(formatPrice(0, 'pl').replace(/\s/g, ' ')).toBe('0,00 zł');
    expect(formatPrice(125000, 'en').replace(/\s/g, ' ')).toBe('PLN 1,250.00');
  });
});

describe('formatPriceInput', () => {
  it.each(['pl', 'en', 'ru'])(
    'writes an amount that reads back as the same grosze in %s',
    (locale) => {
      for (const grosze of [0, 5, 29, 2550, 125000, 1_000_000]) {
        expect(parsePriceGrosze(formatPriceInput(grosze, locale))).toBe(grosze);
      }
    },
  );

  it('uses the decimal comma in Polish', () => {
    expect(formatPriceInput(2550, 'pl')).toBe('25,50');
  });
});

describe('formatTime and formatDateTime', () => {
  it('show the Warsaw wall clock in summer and winter time', () => {
    expect(formatTime('2026-10-06T08:05:00Z', 'pl')).toBe('10:05');
    expect(formatTime('2026-12-06T08:05:00Z', 'pl')).toBe('09:05');
  });

  it('show the date of the Warsaw day with the time', () => {
    expect(formatDateTime('2026-10-07T21:59:00Z', 'pl')).toBe('7 paź 2026, 23:59');
    expect(formatDateTime('2026-10-07T22:00:00Z', 'pl')).toBe('8 paź 2026, 00:00');
  });
});

describe('formatDayWithWeekday', () => {
  it('names the Warsaw day of an instant late in the UTC evening', () => {
    expect(formatDayWithWeekday('2026-10-06T22:30:00Z', 'pl')).toBe('środa, 7 października');
  });
});
