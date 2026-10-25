import { describe, expect, it } from 'vitest';
import { DiscountKind } from '../enums.js';
import {
  addDays,
  ageOn,
  isDiscountEligible,
  latestPermitStart,
  permitStartFormSchema,
  permitValidTo,
  purchasePermitSchema,
} from './purchase.js';

describe('addDays', () => {
  it.each([
    ['2026-10-06', 1, '2026-10-07'],
    ['2026-10-06', 0, '2026-10-06'],
    ['2026-10-06', -6, '2026-09-30'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    // Across both daylight saving changes in Europe/Warsaw: dates have no time to shift.
    ['2026-03-28', 2, '2026-03-30'],
    ['2026-10-24', 2, '2026-10-26'],
  ])('%s + %i days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it('rejects a value that is not YYYY-MM-DD', () => {
    expect(() => addDays('2026-10-06T00:00:00Z', 1)).toThrow(RangeError);
  });
});

describe('permitValidTo', () => {
  it('ends a one-day permit on its first day', () => {
    expect(permitValidTo('2026-10-06', 1)).toBe('2026-10-06');
  });

  it('counts both the first and the last day', () => {
    expect(permitValidTo('2026-10-06', 7)).toBe('2026-10-12');
  });

  it('ends a year permit from 1 January on 31 December', () => {
    expect(permitValidTo('2026-01-01', 365)).toBe('2026-12-31');
    expect(permitValidTo('2028-01-01', 366)).toBe('2028-12-31');
  });
});

describe('latestPermitStart', () => {
  it('allows a start 365 days ahead, next year in December', () => {
    expect(latestPermitStart('2026-12-15')).toBe('2027-12-15');
  });
});

describe('ageOn', () => {
  it.each([
    ['2010-10-06', '2026-10-06', 16],
    ['2010-10-07', '2026-10-06', 15],
    ['2010-10-05', '2026-10-06', 16],
    ['1961-01-01', '2026-01-01', 65],
    ['1961-01-02', '2026-01-01', 64],
    // Born on 29 February: older on 1 March in a common year, on 29 February in a leap year.
    ['2012-02-29', '2028-02-28', 15],
    ['2012-02-29', '2028-02-29', 16],
    ['2012-02-29', '2027-02-28', 14],
    ['2012-02-29', '2027-03-01', 15],
  ])('born %s is %i on %s', (birthDate, on, age) => {
    expect(ageOn(birthDate, on)).toBe(age);
  });
});

describe('isDiscountEligible', () => {
  it('lets anyone buy a regular permit', () => {
    expect(isDiscountEligible(DiscountKind.NONE, '1990-05-01', '2026-10-06')).toBe(true);
  });

  it('gives JUNIOR to those younger than 16 on the first day', () => {
    expect(isDiscountEligible(DiscountKind.JUNIOR, '2010-10-07', '2026-10-06')).toBe(true);
    expect(isDiscountEligible(DiscountKind.JUNIOR, '2010-10-06', '2026-10-06')).toBe(false);
  });

  it('judges the age on validFrom, not on the day of buying', () => {
    // 15 when buying in September, 16 on the chosen first day.
    expect(isDiscountEligible(DiscountKind.JUNIOR, '2010-10-01', '2026-10-06')).toBe(false);
  });

  it('gives SENIOR to those 65 or older on the first day', () => {
    expect(isDiscountEligible(DiscountKind.SENIOR, '1961-10-06', '2026-10-06')).toBe(true);
    expect(isDiscountEligible(DiscountKind.SENIOR, '1961-10-07', '2026-10-06')).toBe(false);
  });
});

describe('purchasePermitSchema', () => {
  const permitTypeId = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f';

  it('accepts a type id and a calendar date', () => {
    expect(purchasePermitSchema.parse({ permitTypeId, validFrom: '2026-10-06' })).toEqual({
      permitTypeId,
      validFrom: '2026-10-06',
    });
  });

  it.each(['2026-02-30', '2027-02-29', '2026-10-6', '06.10.2026', '2026-10-06T00:00:00Z', ''])(
    'rejects validFrom %j',
    (validFrom) => {
      expect(purchasePermitSchema.safeParse({ permitTypeId, validFrom }).success).toBe(false);
    },
  );

  it('rejects a type id that is not a UUID', () => {
    expect(
      purchasePermitSchema.safeParse({ permitTypeId: 'x', validFrom: '2026-10-06' }).success,
    ).toBe(false);
  });
});

describe('permitStartFormSchema', () => {
  const schema = permitStartFormSchema('2026-10-06');
  const issue = (validFrom: string) =>
    schema.safeParse({ validFrom }).error?.issues.map((found) => found.message);

  it('accepts today and the last allowed day', () => {
    expect(issue('2026-10-06')).toBeUndefined();
    expect(issue('2027-10-06')).toBeUndefined();
  });

  it.each([
    ['2026-10-05', 'IN_PAST'],
    ['2027-10-07', 'TOO_LATE'],
    ['2026-02-30', 'INVALID'],
    ['', 'INVALID'],
  ])('reports %j as %s first', (validFrom, expected) => {
    expect(issue(validFrom)?.[0]).toBe(expected);
  });
});
