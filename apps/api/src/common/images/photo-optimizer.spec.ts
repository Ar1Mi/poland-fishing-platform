import sharp from 'sharp';
import { detectFileType } from '../storage/file-signature';
import { InvalidPhotoError, PHOTO_MAX_SIDE, optimizePhoto } from './photo-optimizer';

/** A plain image with GPS and orientation tags, as a phone camera writes it. */
async function cameraJpeg(width: number, height: number, orientation = 1): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2a6f77' } })
    .jpeg({ quality: 95 })
    .withExif({
      IFD0: { Make: 'Phone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 24/1 0/1' },
    })
    .withMetadata({ orientation })
    .toBuffer();
}

describe('optimizePhoto', () => {
  it('scales a large photo down to the longest side and drops EXIF with the position', async () => {
    const input = await cameraJpeg(4000, 3000);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const output = await optimizePhoto(input, 'image/jpeg');

    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([PHOTO_MAX_SIDE, 960]);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(output.length).toBeLessThan(input.length);
  });

  it('turns the photo upright by its orientation before dropping the tag', async () => {
    // Orientation 6: stored landscape, shown rotated by 90°.
    const input = await cameraJpeg(800, 600, 6);
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const output = await optimizePhoto(input, 'image/jpeg');

    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([600, 800]);
    expect(meta.orientation).toBeUndefined();
  });

  it('does not enlarge a small photo', async () => {
    const meta = await sharp(
      await optimizePhoto(await cameraJpeg(640, 480), 'image/jpeg'),
    ).metadata();

    expect([meta.width, meta.height]).toEqual([640, 480]);
  });

  it.each(['image/png', 'image/webp'] as const)('keeps the type %s', async (type) => {
    const base = sharp({ create: { width: 2400, height: 1000, channels: 3, background: '#fff' } });
    const input = await (type === 'image/png' ? base.png() : base.webp())
      .withExif({ IFD0: { Make: 'Phone' } })
      .toBuffer();

    const output = await optimizePhoto(input, type);

    expect((await detectFileType(output))?.mime).toBe(type);
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([PHOTO_MAX_SIDE, 533]);
    expect(meta.exif).toBeUndefined();
  });

  it('refuses a truncated file', async () => {
    const input = await cameraJpeg(800, 600);

    await expect(optimizePhoto(input.subarray(0, input.length / 2), 'image/jpeg')).rejects.toThrow(
      InvalidPhotoError,
    );
  });

  it('refuses an image whose canvas is larger than the pixel limit', async () => {
    // 12000 × 9000 = 108 MP of one colour: a small file, a huge decoded image.
    const input = await sharp({
      create: { width: 12_000, height: 9_000, channels: 3, background: '#000' },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expect(optimizePhoto(input, 'image/png')).rejects.toThrow(InvalidPhotoError);
  });
});
