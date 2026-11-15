import sharp from 'sharp';

/**
 * Real, decodable images for the upload tests: photos are re-encoded by `optimizePhoto` (T-29),
 * so a file that only carries the signature of its type is refused like a corrupt one.
 */

/** 4 × 3 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQyi+HIwacHAD1KwzBE963zQAAAABJRU5ErkJggg==',
  'base64',
);

/** 4 × 3 JPEG with EXIF, the GPS position (52° 24′ N, 21° E) included, as a phone writes it. */
export const JPEG_WITH_GPS = Buffer.from(
  '/9j/4QFARXhpZgAASUkqAAgAAAAIAA8BAgAGAAAAfgAAABIBAwABAAAAAQAAABoBBQABAAAAbgAAABsBBQABAAAAdgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAhAAAACWIBAABAAAA0gAAAAAAAAA4YwAA6AMAADhjAADoAwAAUGhvbmUABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAQAAAADoAQAAQAAAAMAAAAAAAAABAABAAIAAgAAAE4AAAACAAUAAwAAACABAAADAAIAAgAAAEUAAAAEAAUAAwAAAAgBAAAAAAAAFQAAAAEAAAAAAAAAAQAAAAAAAAABAAAANAAAAAEAAAAYAAAAAQAAAAAAAAABAAAA/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgAAwAEAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABUBAQEAAAAAAAAAAAAAAAAAAAUG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AjgCSXf/Z',
  'base64',
);

/** A file with the JPEG signature whose content cannot be decoded. */
export const BROKEN_JPEG = JPEG_WITH_GPS.subarray(0, JPEG_WITH_GPS.length - 40);

/** What a served photo is, read by decoding it. */
export async function decodedImage(
  content: Buffer,
): Promise<{ format: string; width: number; height: number; hasExif: boolean }> {
  const meta = await sharp(content, { failOn: 'error' }).metadata();
  return {
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasExif: meta.exif !== undefined,
  };
}
