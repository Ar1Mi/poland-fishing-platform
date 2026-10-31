import { describe, expect, it } from 'vitest';
import { type CatchFormValues, catchFormSchema, parseWeightKg } from './catch-input.js';

const SPECIES = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f';

const values = (fields: Partial<CatchFormValues> = {}): CatchFormValues => ({
  speciesId: SPECIES,
  lengthCm: '42',
  weightKg: '0,9',
  fate: 'KEPT',
  caughtAt: '2026-06-15T10:00',
  ...fields,
});

const issuePaths = (fields: Partial<CatchFormValues>) => {
  const result = catchFormSchema.safeParse(values(fields));
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('parseWeightKg', () => {
  it('reads kilograms with a comma or a dot into whole grams', () => {
    expect(parseWeightKg('1,25')).toBe(1250);
    expect(parseWeightKg('0.9')).toBe(900);
    expect(parseWeightKg('3')).toBe(3000);
    expect(parseWeightKg('0,005')).toBe(5);
    expect(parseWeightKg(' 12,345 ')).toBe(12_345);
  });

  it('rejects anything but up to three decimals of kilograms', () => {
    for (const text of ['', ',5', '1,2345', '1 250', '-1', '1e3', '1,2,3', '1000']) {
      expect(parseWeightKg(text)).toBe(null);
    }
  });
});

describe('catchFormSchema', () => {
  it('turns the typed form into catch data', () => {
    expect(catchFormSchema.parse(values())).toEqual({
      speciesId: SPECIES,
      lengthCm: 42,
      weightG: 900,
      kept: true,
      caughtAt: new Date('2026-06-15T08:00:00.000Z'),
    });
  });

  it('leaves the weight out when the field is empty', () => {
    expect(catchFormSchema.parse(values({ weightKg: ' ', fate: 'RELEASED' }))).toMatchObject({
      weightG: null,
      kept: false,
    });
  });

  it('bounds the length to whole centimetres from 1 to 400', () => {
    expect(issuePaths({ lengthCm: '1' })).toEqual([]);
    expect(issuePaths({ lengthCm: '400' })).toEqual([]);
    for (const lengthCm of ['0', '401', '', '42,5', '-3']) {
      expect(issuePaths({ lengthCm })).toEqual(['lengthCm']);
    }
  });

  it('bounds the weight from 1 g to 300 kg', () => {
    expect(issuePaths({ weightKg: '0,001' })).toEqual([]);
    expect(issuePaths({ weightKg: '300' })).toEqual([]);
    for (const weightKg of ['0', '0,000', '300,001', 'ciężka']) {
      expect(issuePaths({ weightKg })).toEqual(['weightKg']);
    }
  });

  it('requires choosing kept or released', () => {
    expect(issuePaths({ fate: '' as CatchFormValues['fate'] })).toEqual(['fate']);
  });

  it('requires an existing Warsaw time', () => {
    expect(issuePaths({ caughtAt: '' })).toEqual(['caughtAt']);
    expect(issuePaths({ caughtAt: '2026-03-29T02:30' })).toEqual(['caughtAt']);
  });

  it('requires a species', () => {
    expect(issuePaths({ speciesId: '' })).toEqual(['speciesId']);
  });
});
