import { z } from 'zod';
import { WaterType } from '../enums.js';
import { isInBbox, isRegion, POLAND_BOUNDS, type Region } from './catalog.js';

// A water an angler misses in the catalogue (FR-25): the catalogue fields of a `FishingWater`
// row with `source: USER`, unpublished until a super admin publishes it. The same limits as
// the CSV import (`apps/api/src/modules/waters/import/water-csv.ts`); the API validates them
// again with a class-validator DTO.

export const WATER_NAME_MIN_LENGTH = 2;
export const WATER_NAME_MAX_LENGTH = 200;

/** A position of the suggestion; the map and the fields of the form share it. */
export interface WaterPosition {
  lat: number;
  lng: number;
}

/** Whether a position lies in Poland (the catalogue's bounds, `POLAND_BOUNDS`). */
export function isInPoland({ lat, lng }: WaterPosition): boolean {
  return isInBbox(lat, lng, POLAND_BOUNDS);
}

const isWaterType = (value: string): value is WaterType =>
  (Object.values(WaterType) as string[]).includes(value);

/** Issue messages of the fields; the forms translate them. */
export const WaterSuggestionIssue = {
  REQUIRED: 'REQUIRED',
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
  OUT_OF_POLAND: 'OUT_OF_POLAND',
} as const;
export type WaterSuggestionIssue = (typeof WaterSuggestionIssue)[keyof typeof WaterSuggestionIssue];

/**
 * Name, type and voivodeship: what the angler types and what the super admin corrects before
 * publishing. A select left empty is refused on its own field.
 */
export const waterFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(WATER_NAME_MIN_LENGTH, WaterSuggestionIssue.TOO_SHORT)
    .max(WATER_NAME_MAX_LENGTH, WaterSuggestionIssue.TOO_LONG),
  type: z.string().refine(isWaterType, WaterSuggestionIssue.REQUIRED),
  region: z
    .string()
    .refine((value): value is Region => isRegion(value), WaterSuggestionIssue.REQUIRED),
});
export type WaterFieldsFormValues = z.input<typeof waterFieldsSchema>;
export type WaterFieldsInput = z.output<typeof waterFieldsSchema>;

/**
 * The form of `POST /waters/suggestions`: the fields and a position in Poland, picked on the
 * map or typed (an empty number field arrives as NaN and is refused as missing).
 */
export const waterSuggestionSchema = waterFieldsSchema
  .extend({
    lat: z.number({ error: WaterSuggestionIssue.REQUIRED }).refine(Number.isFinite, {
      error: WaterSuggestionIssue.REQUIRED,
    }),
    lng: z.number({ error: WaterSuggestionIssue.REQUIRED }).refine(Number.isFinite, {
      error: WaterSuggestionIssue.REQUIRED,
    }),
  })
  .superRefine((value, ctx) => {
    if (!isInPoland(value)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: WaterSuggestionIssue.OUT_OF_POLAND });
    }
  });
export type WaterSuggestionFormValues = z.input<typeof waterSuggestionSchema>;
export type WaterSuggestionInput = z.output<typeof waterSuggestionSchema>;
