import { parseWeightKg } from '@lowisko/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { MyPermit } from '../../permits/api/usePurchase';
import { catchPlaces, formatWeightInput, readLastChoice, rememberChoice } from './catch-form';

const permit = (id: string, name: string, waters: [string, string][]): MyPermit => ({
  id,
  number: `ZW-2026-${id}`,
  status: 'ACTIVE',
  validFrom: '2026-10-01',
  validTo: '2026-10-31',
  pricePaidGrosze: 4000,
  permitType: { id: `type-${id}`, name, durationDays: 31, discountKind: 'NONE' },
  organization: { id: 'org', name: 'Koło PZW 7' },
  waters: waters.map(([waterId, waterName]) => ({ id: waterId, name: waterName })),
  createdAt: '2026-10-01T10:00:00.000Z',
  qrToken: 'token',
});

describe('catchPlaces', () => {
  it('lists the waters of the permits by name', () => {
    const places = catchPlaces([
      permit('p1', 'Miesięczne', [
        ['w2', 'Zalew Zegrzyński'],
        ['w1', 'Jezioro Łańskie'],
      ]),
    ]);

    expect(places).toEqual([
      {
        key: 'p1:w1',
        permitId: 'p1',
        waterId: 'w1',
        waterName: 'Jezioro Łańskie',
        permitName: null,
      },
      {
        key: 'p1:w2',
        permitId: 'p1',
        waterId: 'w2',
        waterName: 'Zalew Zegrzyński',
        permitName: null,
      },
    ]);
  });

  it('names the permit only for a water two permits cover', () => {
    const places = catchPlaces([
      permit('p1', 'Miesięczne', [['w1', 'Narew']]),
      permit('p2', 'Dzienne', [
        ['w1', 'Narew'],
        ['w2', 'Bug'],
      ]),
    ]);

    expect(places.map(({ key, permitName }) => [key, permitName])).toEqual([
      ['p2:w2', null],
      ['p1:w1', 'Miesięczne'],
      ['p2:w1', 'Dzienne'],
    ]);
  });
});

describe('last choice', () => {
  afterEach(() => localStorage.clear());

  it('remembers the water and the species', () => {
    rememberChoice({ place: 'p1:w1', speciesId: 's1' });
    expect(readLastChoice()).toEqual({ place: 'p1:w1', speciesId: 's1' });
  });

  it('ignores a missing or broken value', () => {
    expect(readLastChoice()).toBe(null);
    localStorage.setItem('lowisko.catch.last', '{not json');
    expect(readLastChoice()).toBe(null);
    localStorage.setItem('lowisko.catch.last', '{"place":1}');
    expect(readLastChoice()).toBe(null);
  });
});

describe('formatWeightInput', () => {
  it.each(['pl', 'en', 'ru'])(
    'writes a weight that reads back as the same grams in %s',
    (locale) => {
      for (const grams of [1, 5, 900, 1250, 12_345, 300_000]) {
        expect(parseWeightKg(formatWeightInput(grams, locale))).toBe(grams);
      }
    },
  );

  it('leaves the field empty without a weight', () => {
    expect(formatWeightInput(null, 'pl')).toBe('');
  });
});
