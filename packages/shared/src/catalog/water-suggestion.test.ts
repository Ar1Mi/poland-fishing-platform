import { describe, expect, it } from 'vitest';
import { isInPoland, waterFieldsSchema, waterSuggestionSchema } from './water-suggestion.js';

const valid = {
  name: 'Staw Dolny',
  type: 'POND',
  region: 'mazowieckie',
  lat: 52.4,
  lng: 21.0,
};

const issuesOf = (changes: Record<string, unknown>) =>
  waterSuggestionSchema
    .safeParse({ ...valid, ...changes })
    .error?.issues.map((issue) => [issue.path[0], issue.message]);

describe('waterSuggestionSchema', () => {
  it('accepts a named water with a type, a voivodeship and a position in Poland', () => {
    expect(waterSuggestionSchema.parse({ ...valid, name: '  Staw Dolny ' })).toEqual(valid);
  });

  it('refuses a one-letter or too long name, an empty or unknown type or region', () => {
    expect(issuesOf({ name: ' S ' })).toEqual([['name', 'TOO_SHORT']]);
    expect(issuesOf({ name: 'x'.repeat(201) })).toEqual([['name', 'TOO_LONG']]);
    expect(issuesOf({ type: 'SEA' })).toEqual([['type', 'REQUIRED']]);
    expect(issuesOf({ type: '' })).toEqual([['type', 'REQUIRED']]);
    expect(issuesOf({ region: 'Mazowieckie' })).toEqual([['region', 'REQUIRED']]);
    expect(issuesOf({ region: '' })).toEqual([['region', 'REQUIRED']]);
  });

  it('refuses a missing position (an empty number field is NaN) as required', () => {
    expect(issuesOf({ lat: Number.NaN })).toEqual([['lat', 'REQUIRED']]);
    expect(issuesOf({ lng: undefined })).toEqual([['lng', 'REQUIRED']]);
  });

  it('refuses a position outside Poland on the lat field', () => {
    expect(issuesOf({ lat: 21.0, lng: 52.4 })).toEqual([['lat', 'OUT_OF_POLAND']]);
  });
});

describe('waterFieldsSchema', () => {
  it('is the part of the suggestion the moderator corrects', () => {
    expect(waterFieldsSchema.parse({ name: 'Narew ', type: 'RIVER', region: 'podlaskie' })).toEqual(
      {
        name: 'Narew',
        type: 'RIVER',
        region: 'podlaskie',
      },
    );
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
