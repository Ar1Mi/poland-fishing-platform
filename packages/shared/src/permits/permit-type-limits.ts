// Limits of permit types (FR-07), without zod: the catalogue on the first screen reads
// LOWEST_PRICES_MAX_WATERS and must not carry the schemas of permit-types.ts (T-29).
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
