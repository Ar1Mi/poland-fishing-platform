import { describe, expect, it } from 'vitest';
import {
  WATER_DESCRIPTION_MAX_LENGTH,
  WATER_PHOTO_EXTENSIONS,
  WATER_PHOTO_MIME_TYPES,
  WATER_SEASON_INFO_MAX_LENGTH,
  isWaterPhotoType,
  waterPhotoTypeOf,
  waterProfileSchema,
} from './water-profile.js';

describe('isWaterPhotoType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(isWaterPhotoType(type)).toBe(true);
  });

  it.each(['application/pdf', 'image/gif', 'image/svg+xml', ''])('rejects %s', (type) => {
    expect(isWaterPhotoType(type)).toBe(false);
  });
});

describe('waterPhotoTypeOf', () => {
  it('maps every photo type to its extension and back', () => {
    for (const type of WATER_PHOTO_MIME_TYPES) {
      expect(waterPhotoTypeOf(`waters/x.${WATER_PHOTO_EXTENSIONS[type]}`)).toBe(type);
    }
  });

  it('knows nothing of a stored PDF or a name without an extension', () => {
    expect(waterPhotoTypeOf('waters/x.pdf')).toBeUndefined();
    expect(waterPhotoTypeOf('waters/x')).toBeUndefined();
  });
});

describe('waterProfileSchema', () => {
  it('trims both texts and turns blank ones into null', () => {
    expect(waterProfileSchema.parse({ description: '  Jezioro  ', seasonInfo: '   ' })).toEqual({
      description: 'Jezioro',
      seasonInfo: null,
    });
  });

  it('accepts the longest texts and refuses one character more', () => {
    const at = (length: number) => 'a'.repeat(length);
    expect(
      waterProfileSchema.safeParse({
        description: at(WATER_DESCRIPTION_MAX_LENGTH),
        seasonInfo: at(WATER_SEASON_INFO_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      waterProfileSchema.safeParse({
        description: at(WATER_DESCRIPTION_MAX_LENGTH + 1),
        seasonInfo: '',
      }).success,
    ).toBe(false);
    expect(
      waterProfileSchema.safeParse({
        description: '',
        seasonInfo: at(WATER_SEASON_INFO_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
