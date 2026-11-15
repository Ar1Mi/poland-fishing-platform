import { ErrorCode } from '@lowisko/shared';
import sharp from 'sharp';
import { DomainError } from '../errors/domain-error';

/** Image types a photo may have (water card, catch): the same set in `@lowisko/shared`. */
export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Longest side of a stored photo in pixels: the card on a phone (about 380 CSS px) at a
 * 3× screen, and the widest card on a desktop (1024 px). Measured in Lighthouse (T-29): the card
 * photo is its Largest Contentful Paint, and every kilobyte of it is on a slow phone network.
 */
export const PHOTO_MAX_SIDE = 1280;

/**
 * Larger images are refused before decoding: a 5 MB file can declare a huge canvas
 * (decompression bomb). 100 MP is above any phone camera.
 */
export const PHOTO_MAX_INPUT_PIXELS = 100_000_000;

/** The photo cannot be decoded as the image type its signature claims. */
export class InvalidPhotoError extends Error {
  constructor(cause: unknown) {
    super('The photo cannot be decoded', { cause });
    this.name = 'InvalidPhotoError';
  }
}

/**
 * Re-encodes an uploaded photo in its own type (T-29): turned upright by its EXIF orientation,
 * scaled down to {@link PHOTO_MAX_SIDE} and written without metadata — EXIF, XMP and IPTC can
 * hold the GPS position of the angler or of the spot. The type stays, so the stored key's
 * extension still tells it (`waterPhotoTypeOf`, `catchPhotoTypeOf`).
 */
export async function optimizePhoto(content: Buffer, type: PhotoType): Promise<Buffer> {
  // `failOn: 'error'`: a truncated or corrupt file is refused, not stored half-decoded.
  // An animated WebP keeps its first frame (the default `pages: 1`).
  const image = sharp(content, { failOn: 'error', limitInputPixels: PHOTO_MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: PHOTO_MAX_SIDE,
      height: PHOTO_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  // No `withMetadata()`: sharp writes none, except the ICC profile turned into sRGB.
  const encoded =
    type === 'image/jpeg'
      ? image.jpeg({ quality: 80, mozjpeg: true })
      : type === 'image/png'
        ? image.png({ compressionLevel: 9, palette: false })
        : image.webp({ quality: 80 });
  try {
    return await encoded.toBuffer();
  } catch (error) {
    throw new InvalidPhotoError(error);
  }
}

/**
 * {@link optimizePhoto} of an upload: a file that cannot be decoded is the client's error,
 * answered like a file of another type (400 `VALIDATION_FAILED` on the `file` field).
 */
export async function optimizeUploadedPhoto(content: Buffer, type: PhotoType): Promise<Buffer> {
  try {
    return await optimizePhoto(content, type);
  } catch (error) {
    if (error instanceof InvalidPhotoError) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file must be a readable JPEG, PNG or WebP image'] } },
        'Photo cannot be decoded',
      );
    }
    throw error;
  }
}
