import { z } from 'zod';
import { WaterType } from '../enums.js';
import { isInBbox, POLAND_BOUNDS, REGIONS } from './catalog.js';

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

/**
 * The form of `POST /waters/suggestions`: name, type, voivodeship and a position in Poland
 * (picked on the map or typed). An empty select is refused on its own field.
 */
export const waterSuggestionSchema = z
  .object({
    name: z.string().trim().min(WATER_NAME_MIN_LENGTH).max(WATER_NAME_MAX_LENGTH),
    type: z.enum(WaterType),
    region: z.enum(REGIONS),
    lat: z.number(),
    lng: z.number(),
  })
  .superRefine((value, ctx) => {
    if (!isInPoland(value)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'OUT_OF_POLAND' });
    }
  });
export type WaterSuggestionInput = z.output<typeof waterSuggestionSchema>;
