import { describe, expect, it } from 'vitest';
import { isInPoland, waterSuggestionSchema } from './water-suggestion.js';

const valid = {
  name: 'Staw Dolny',
  type: 'POND',
  region: 'mazowieckie',
  lat: 52.4,
  lng: 21.0,
};

describe('waterSuggestionSchema', () => {
  it('accepts a named water with a type, a voivodeship and a position in Poland', () => {
    expect(waterSuggestionSchema.parse({ ...valid, name: '  Staw Dolny ' })).toEqual(valid);
  });

  it('refuses a one-letter or too long name, an unknown type or region', () => {
    const issues = (changes: Record<string, unknown>) =>
      waterSuggestionSchema.safeParse({ ...valid, ...changes }).error?.issues.map((i) => i.path[0]);
    expect(issues({ name: ' S ' })).toEqual(['name']);
    expect(issues({ name: 'x'.repeat(201) })).toEqual(['name']);
    expect(issues({ type: 'SEA' })).toEqual(['type']);
    expect(issues({ type: '' })).toEqual(['type']);
    expect(issues({ region: 'Mazowieckie' })).toEqual(['region']);
  });

  it('refuses a position outside Poland on the lat field', () => {
    const result = waterSuggestionSchema.safeParse({ ...valid, lat: 21.0, lng: 52.4 });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['lat'], message: 'OUT_OF_POLAND' }),
    ]);
  });
});

describe('isInPoland', () => {
  it('holds on the extreme points and fails just outside them', () => {
    expect(isInPoland({ lat: 49.0, lng: 14.07 })).toBe(true);
    expect(isInPoland({ lat: 54.84, lng: 24.15 })).toBe(true);
    expect(isInPoland({ lat: 48.99, lng: 20 })).toBe(false);
    expect(isInPoland({ lat: 52, lng: 24.16 })).toBe(false);
  });
});
