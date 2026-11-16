import { REGIONS } from '@lowisko/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../../../shared/i18n/i18n';
import { regionLabel, regionOptions } from './region';

describe('regionLabel', () => {
  afterEach(() => i18n.changeLanguage('pl'));

  it('keeps the stored Polish name in pl', async () => {
    await i18n.changeLanguage('pl');

    expect(regionLabel(i18n.t, 'mazowieckie')).toBe('mazowieckie');
  });

  it('translates the voivodeship in en and ru', async () => {
    await i18n.changeLanguage('en');
    expect(regionLabel(i18n.t, 'małopolskie')).toBe('Lesser Poland');

    await i18n.changeLanguage('ru');
    expect(regionLabel(i18n.t, 'małopolskie')).toBe('Малопольское');
  });

  it('shows a value outside the dictionary as it is', () => {
    expect(regionLabel(i18n.t, 'Mazowsze')).toBe('Mazowsze');
  });
});

describe('regionOptions', () => {
  afterEach(() => i18n.changeLanguage('pl'));

  it('sorts the voivodeships by their name in the interface language', async () => {
    await i18n.changeLanguage('en');
    const options = regionOptions(i18n.t, 'en');

    expect(options).toHaveLength(REGIONS.length);
    expect(options[0]).toEqual({ value: 'wielkopolskie', label: 'Greater Poland' });
    expect(options.at(-1)).toEqual({ value: 'zachodniopomorskie', label: 'West Pomeranian' });
  });

  it('sorts Polish names with Polish letters in place', () => {
    const labels = regionOptions(i18n.t, 'pl').map((option) => option.label);

    expect(labels.indexOf('łódzkie')).toBe(labels.indexOf('lubuskie') + 1);
    expect(labels.at(-1)).toBe('zachodniopomorskie');
  });
});
