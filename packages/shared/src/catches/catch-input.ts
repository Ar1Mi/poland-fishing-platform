import { z } from 'zod';
import { fromWarsawDateTimeLocal, warsawDate } from '../time/warsaw.js';

// Data of a catch (FR-11) as the API and the catch form accept it. Input checks, not BR-*:
// `validateCatch` takes them for granted (docs/02-business-rules.md → «Уточнения (T-18)»).

/** Longer than any rule bound (`RULE_MIN_LENGTH_MAX_CM`): a protected sturgeon is recorded too. */
export const CATCH_LENGTH_MAX_CM = 400;

/** One fish, in grams. Zero is no weight: it would let a kept fish pass a no-kill limit (BR-05). */
export const CATCH_WEIGHT_MAX_G = 300_000;

/** Catches in one `POST /catches/sync` (docs/05-api.md). */
export const CATCH_SYNC_MAX_ITEMS = 100;

/**
 * Seasons (Warsaw calendar years) a catch may fall into: the ones `GET /me/catches` can list. A
 * catch outside them could be neither seen nor deleted — and year 10000 breaks the date helpers.
 */
export const CATCH_SEASONS = { FIRST: 2000, LAST: 2100 } as const;

/** Whether the Warsaw year of `caughtAt` is one of `CATCH_SEASONS`. */
export function isInCatchSeasons(caughtAt: Date): boolean {
  if (Number.isNaN(caughtAt.getTime())) {
    return false;
  }
  // `split`, not `slice(0, 4)`: after 9999 the year has five digits.
  const year = Number(warsawDate(caughtAt).split('-')[0]);
  return year >= CATCH_SEASONS.FIRST && year <= CATCH_SEASONS.LAST;
}

const WEIGHT_KG_PATTERN = /^(\d{1,3})(?:[.,](\d{1,3}))?$/;

/** Kilograms as typed (`1,25`, `0.9`, `3`) in whole grams, without float; `null` if malformed. */
export function parseWeightKg(text: string): number | null {
  const match = WEIGHT_KG_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, kilograms = '', grams = ''] = match;
  return Number(kilograms) * 1000 + Number(grams.padEnd(3, '0'));
}

/** Whether the fish was kept (counts towards the daily limits) or released. */
export const CatchFate = { KEPT: 'KEPT', RELEASED: 'RELEASED' } as const;
export type CatchFate = (typeof CatchFate)[keyof typeof CatchFate];

const lengthCm = z.int().min(1).max(CATCH_LENGTH_MAX_CM);
const weightG = z.int().min(1).max(CATCH_WEIGHT_MAX_G);

/**
 * The catch form: numbers as typed, weight in kilograms and optional, the time as Warsaw wall
 * clock (`<input type="datetime-local">`). Kept or released must be chosen, never defaulted.
 * Output is the catch data of the API body; the permit and the water are picked separately.
 */
export const catchFormSchema = z
  .object({
    speciesId: z.uuid(),
    lengthCm: z
      .string()
      .trim()
      .regex(/^\d{1,4}$/)
      .transform(Number)
      .pipe(lengthCm),
    weightKg: z
      .string()
      .trim()
      .transform((text) => (text === '' ? null : text))
      .pipe(z.union([z.null(), z.string().transform(parseWeightKg).pipe(weightG)])),
    fate: z.enum(CatchFate),
    caughtAt: z.string().transform(fromWarsawDateTimeLocal).pipe(z.date().refine(isInCatchSeasons)),
  })
  .transform(({ weightKg, fate, ...fields }) => ({
    ...fields,
    weightG: weightKg,
    kept: fate === CatchFate.KEPT,
  }));
export type CatchFormValues = z.input<typeof catchFormSchema>;
export type CatchFormOutput = z.output<typeof catchFormSchema>;
