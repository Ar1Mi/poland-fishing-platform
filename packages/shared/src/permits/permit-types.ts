import { z } from 'zod';
import { DiscountKind } from '../enums.js';

// Permit types (FR-07): what an organization sells, for which of its connected waters.
// The API validates the same limits with class-validator DTOs.

export const PERMIT_TYPE_NAME_MAX_LENGTH = 100;
/** The longest permit is a season one: a leap year. */
export const PERMIT_DURATION_MAX_DAYS = 366;
/** 10 000 zł. A free type (0) is allowed, see `permit_type_positive` in docs/04-data-model.md. */
export const PERMIT_PRICE_MAX_GROSZE = 1_000_000;
/** A district (okręg) permit may cover hundreds of obwody. */
export const PERMIT_TYPE_MAX_WATERS = 1000;
/** Waters in one `GET /permit-types/lowest-prices` request: one page of the catalogue list. */
export const LOWEST_PRICES_MAX_WATERS = 100;

/**
 * Terms of a sold permit, fixed once the type has permits: the waters decide what a sold
 * permit covers (BR-01), the duration and the discount are what the angler bought. The name,
 * the price of future purchases and `isActive` stay editable.
 */
export const PERMIT_TYPE_LOCKED_FIELDS = ['durationDays', 'discountKind', 'waterIds'] as const;
export type PermitTypeLockedField = (typeof PERMIT_TYPE_LOCKED_FIELDS)[number];

const PRICE_PATTERN = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/**
 * A price typed in złoty (`25`, `25,5`, `1 250,00`, `25.50`) as whole grosze; null when it is
 * not one. Integer arithmetic only: money never goes through a float.
 */
export function parsePriceGrosze(text: string): number | null {
  // Spaces group thousands; `\s` also matches the non-breaking ones of Polish formatting.
  const match = PRICE_PATTERN.exec(text.replace(/\s/g, ''));
  if (!match) {
    return null;
  }
  const [, zloty = '', grosze = ''] = match;
  return Number(zloty) * 100 + Number(grosze.padEnd(2, '0'));
}

const name = z.string().trim().min(1).max(PERMIT_TYPE_NAME_MAX_LENGTH);
const durationDays = z.int().min(1).max(PERMIT_DURATION_MAX_DAYS);
const priceGrosze = z.int().min(0).max(PERMIT_PRICE_MAX_GROSZE);
const discountKind = z.enum(DiscountKind);
const waterIds = z
  .array(z.uuid())
  .min(1)
  .max(PERMIT_TYPE_MAX_WATERS)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate water' });

/** Body of `POST /orgs/:orgId/permit-types`. */
export const permitTypeSchema = z.object({
  name,
  durationDays,
  priceGrosze,
  discountKind,
  waterIds,
});
export type PermitTypeInput = z.infer<typeof permitTypeSchema>;

/** The form of the organization admin: duration and price as typed; output is the API body. */
export const permitTypeFormSchema = z
  .object({
    name,
    durationDays: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(durationDays),
    price: z.string().transform(parsePriceGrosze).pipe(priceGrosze),
    discountKind,
    waterIds,
  })
  .transform(({ price, ...fields }): PermitTypeInput => ({ ...fields, priceGrosze: price }));
export type PermitTypeFormValues = z.input<typeof permitTypeFormSchema>;
