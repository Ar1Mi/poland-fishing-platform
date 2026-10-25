import { describe, expect, it } from 'vitest';
import {
  PERMIT_PRICE_MAX_GROSZE,
  PERMIT_TYPE_MAX_WATERS,
  parsePriceGrosze,
  permitTypeFormSchema,
  permitTypeSchema,
} from './permit-types.js';

const WATER = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f';
const OTHER_WATER = '7e8f9a0b-1c2d-4e3f-8a5b-6c7d8e9f0a1b';

describe('parsePriceGrosze', () => {
  it.each([
    ['25', 2500],
    ['25,5', 2550],
    ['25,50', 2550],
    ['25.05', 2505],
    ['0', 0],
    ['0,99', 99],
    [' 1 250,00 ', 125000],
    ['1\u00a0250', 125000],
    ['1\u202f250,10', 125010],
    ['999999999,99', 99999999999],
  ])('reads %j as %i grosze', (text, grosze) => {
    expect(parsePriceGrosze(text)).toBe(grosze);
  });

  it('keeps grosze exact where float arithmetic would not', () => {
    // 0.29 * 100 === 28.999999999999996 in floating point.
    expect(parsePriceGrosze('0,29')).toBe(29);
    expect(parsePriceGrosze('19,99')).toBe(1999);
  });

  it.each(['', ' ', 'abc', '-5', '+5', '25,505', '25,', ',50', '25 zł', '1e3', '25,5,0', '0x10'])(
    'rejects %j',
    (text) => {
      expect(parsePriceGrosze(text)).toBeNull();
    },
  );
});

describe('permitTypeSchema', () => {
  const valid = {
    name: 'Dzienne',
    durationDays: 1,
    priceGrosze: 2500,
    discountKind: 'NONE',
    waterIds: [WATER],
  };

  it('accepts a free type and the limits', () => {
    expect(permitTypeSchema.safeParse({ ...valid, priceGrosze: 0 }).success).toBe(true);
    expect(
      permitTypeSchema.safeParse({
        ...valid,
        durationDays: 366,
        priceGrosze: PERMIT_PRICE_MAX_GROSZE,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['zero days', { durationDays: 0 }],
    ['more than a leap year', { durationDays: 367 }],
    ['a fractional duration', { durationDays: 1.5 }],
    ['a negative price', { priceGrosze: -1 }],
    ['a fractional price', { priceGrosze: 25.5 }],
    ['a price over the limit', { priceGrosze: PERMIT_PRICE_MAX_GROSZE + 1 }],
    ['an unknown discount', { discountKind: 'STUDENT' }],
    ['no water', { waterIds: [] }],
    ['a water twice', { waterIds: [WATER, WATER] }],
    ['a water that is not a UUID', { waterIds: ['water-1'] }],
    [
      'too many waters',
      { waterIds: Array.from({ length: PERMIT_TYPE_MAX_WATERS + 1 }, () => WATER) },
    ],
  ])('rejects %s', (_case, change) => {
    expect(permitTypeSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('permitTypeFormSchema', () => {
  const form = {
    name: '  Tygodniowe ',
    durationDays: '7',
    price: '60,50',
    discountKind: 'JUNIOR',
    waterIds: [WATER, OTHER_WATER],
  } as const;

  it('turns the typed values into the API body', () => {
    expect(permitTypeFormSchema.parse(form)).toEqual({
      name: 'Tygodniowe',
      durationDays: 7,
      priceGrosze: 6050,
      discountKind: 'JUNIOR',
      waterIds: [WATER, OTHER_WATER],
    });
  });

  it.each([
    ['price', { price: '60,505' }],
    ['price', { price: '' }],
    ['price', { price: '10000,01' }],
    ['durationDays', { durationDays: '' }],
    ['durationDays', { durationDays: '1.5' }],
    ['durationDays', { durationDays: '0' }],
  ])('reports a bad %s on that field', (field, change) => {
    const result = permitTypeFormSchema.safeParse({ ...form, ...change });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([field]);
  });
});
