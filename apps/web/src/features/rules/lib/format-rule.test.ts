import { describe, expect, it } from 'vitest';
import { formatMonthDay, formatWeight } from './format-rule';

describe('formatMonthDay', () => {
  it.each([
    ['01-01', '1 stycznia'],
    ['02-28', '28 lutego'],
    ['12-31', '31 grudnia'],
  ])('shows %s as %s in Polish', (monthDay, text) => {
    expect(formatMonthDay(monthDay, 'pl')).toBe(text);
  });
});

describe('formatWeight', () => {
  it.each([
    [500, '500 g'],
    [1000, '1 kg'],
    [2500, '2,5 kg'],
    [0, '0 g'],
  ])('shows %i g as %s', (grams, text) => {
    expect(formatWeight(grams, 'pl')).toBe(text);
  });
});
