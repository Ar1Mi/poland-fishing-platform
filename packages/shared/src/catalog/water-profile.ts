import { z } from 'zod';
import { CLAIM_PROOF_EXTENSIONS, CLAIM_PROOF_MAX_BYTES } from '../claims/claims.js';

// What an organization tells anglers about its connected water (FR-05): a description, the
// fishing season in its own words and a photo. Catalogue fields (name, type, region, position)
// stay with the import. The API validates the same limits with class-validator DTOs.

export const WATER_DESCRIPTION_MAX_LENGTH = 2000;
/** E.g. «1 V – 30 IX, 6:00–22:00; zimą tylko z brzegu». Shown, never checked against catches. */
export const WATER_SEASON_INFO_MAX_LENGTH = 300;

/** The card shows the photo as an image: no PDF, unlike documents. */
export const WATER_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type WaterPhotoType = (typeof WATER_PHOTO_MIME_TYPES)[number];
/** The limit of every stored file (docs/03-architecture.md → «Файлы»). */
export const WATER_PHOTO_MAX_BYTES = CLAIM_PROOF_MAX_BYTES;

export function isWaterPhotoType(value: string): value is WaterPhotoType {
  return (WATER_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

/** File extension of each photo type: the stored file is named by it. */
export const WATER_PHOTO_EXTENSIONS: Readonly<Record<WaterPhotoType, string>> = {
  'image/jpeg': CLAIM_PROOF_EXTENSIONS['image/jpeg'],
  'image/png': CLAIM_PROOF_EXTENSIONS['image/png'],
  'image/webp': CLAIM_PROOF_EXTENSIONS['image/webp'],
};

/** Photo type of a stored file name (`waters/<uuid>.png`); undefined for anything else. */
export function waterPhotoTypeOf(fileName: string): WaterPhotoType | undefined {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
  return WATER_PHOTO_MIME_TYPES.find((type) => WATER_PHOTO_EXTENSIONS[type] === extension);
}

const blankIsNull = (text: string) => (text === '' ? null : text);

/**
 * The form of `PATCH /orgs/:orgId/waters/:id`: both fields are sent, a blank one clears the
 * text (`null`).
 */
export const waterProfileSchema = z.object({
  description: z.string().trim().max(WATER_DESCRIPTION_MAX_LENGTH).transform(blankIsNull),
  seasonInfo: z.string().trim().max(WATER_SEASON_INFO_MAX_LENGTH).transform(blankIsNull),
});
export type WaterProfileFormValues = z.input<typeof waterProfileSchema>;
export type WaterProfileInput = z.output<typeof waterProfileSchema>;
