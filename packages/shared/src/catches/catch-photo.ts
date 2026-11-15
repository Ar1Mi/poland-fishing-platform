import {
  WATER_PHOTO_EXTENSIONS,
  WATER_PHOTO_MAX_BYTES,
  WATER_PHOTO_MIME_TYPES,
  type WaterPhotoType,
  isWaterPhotoType,
  waterPhotoTypeOf,
} from '../catalog/water-profile.js';

// A photo of a catch (FR-14): added to a catch already in the register, within its BR-07
// window, as evidence for the angler's own record. The register shows it as an image, so the
// formats are those of the water photo (no PDF); the limit is that of every stored file.

export const CATCH_PHOTO_MIME_TYPES = WATER_PHOTO_MIME_TYPES;
export const CATCH_PHOTO_MAX_BYTES = WATER_PHOTO_MAX_BYTES;
export type CatchPhotoType = WaterPhotoType;
/** File extension of each photo type: the stored file and the downloaded copy are named by it. */
export const CATCH_PHOTO_EXTENSIONS: Readonly<Record<CatchPhotoType, string>> =
  WATER_PHOTO_EXTENSIONS;
export const isCatchPhotoType: (value: string) => value is CatchPhotoType = isWaterPhotoType;
/** Photo type of a stored file name (`catches/<uuid>.jpg`); undefined for anything else. */
export const catchPhotoTypeOf: (fileName: string) => CatchPhotoType | undefined = waterPhotoTypeOf;
