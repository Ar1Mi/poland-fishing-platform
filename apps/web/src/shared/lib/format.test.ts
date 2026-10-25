import { describe, expect, it } from 'vitest';
import { parsePriceGrosze } from '@lowisko/shared';
import { formatDate, formatPrice, formatPriceInput } from './format';

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
