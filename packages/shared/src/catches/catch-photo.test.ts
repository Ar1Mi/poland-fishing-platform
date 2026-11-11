import { describe, expect, it } from 'vitest';
import {
  CATCH_PHOTO_EXTENSIONS,
  CATCH_PHOTO_MAX_BYTES,
  CATCH_PHOTO_MIME_TYPES,
  catchPhotoTypeOf,
  isCatchPhotoType,
} from './catch-photo.js';

describe('catch photo', () => {
  it('is an image of up to 5 MB, never a PDF', () => {
    expect(CATCH_PHOTO_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(CATCH_PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(isCatchPhotoType('image/webp')).toBe(true);
    expect(isCatchPhotoType('application/pdf')).toBe(false);
  });

  it('reads the type back from the stored file name', () => {
    for (const type of CATCH_PHOTO_MIME_TYPES) {
      expect(catchPhotoTypeOf(`catches/0f4a2c7e.${CATCH_PHOTO_EXTENSIONS[type]}`)).toBe(type);
    }
    expect(catchPhotoTypeOf('catches/0f4a2c7e.pdf')).toBeUndefined();
  });
});
