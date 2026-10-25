import { z } from 'zod';
import { DiscountKind } from '../enums.js';
import { assertDateOnly, type DateOnly } from '../time/warsaw.js';

// Buying a permit (FR-08, BR-08, BR-09): dates and the discount check shared by the API and
// the purchase form. Rules and their reasons — docs/02-business-rules.md → «Уточнения».

/** BR-08 defaults: JUNIOR is younger than 16, SENIOR is 65 or older on `validFrom`. */
export const DISCOUNT_AGE = { JUNIOR_BELOW: 16, SENIOR_FROM: 65 } as const;

/** The latest start, in days after today (Warsaw): enough to buy next year's permit in December. */
export const PERMIT_START_MAX_DAYS_AHEAD = 365;

/** Abandoned payments are cancelled after this many minutes (docs/03-architecture.md). */
export const PAYMENT_TIMEOUT_MINUTES = 30;

/** `date` moved by `days` calendar days; UTC arithmetic, so no daylight saving shift. */
export function addDays(date: DateOnly, days: number): DateOnly {
  assertDateOnly(date);
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Last valid day (inclusive) of a permit lasting `durationDays` from `validFrom`. */
export function permitValidTo(validFrom: DateOnly, durationDays: number): DateOnly {
  return addDays(validFrom, durationDays - 1);
}

/** The last day a permit bought on `today` may start on. */
export function latestPermitStart(today: DateOnly): DateOnly {
  return addDays(today, PERMIT_START_MAX_DAYS_AHEAD);
}

/** Full years of age on `on`; born on 29 February, one gets older on 1 March in common years. */
export function ageOn(birthDate: DateOnly, on: DateOnly): number {
  assertDateOnly(birthDate);
  assertDateOnly(on);
  const years = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return on.slice(5) >= birthDate.slice(5) ? years : years - 1;
}

/** BR-08: whether someone born on `birthDate` may buy a permit of `kind` starting on `validFrom`. */
export function isDiscountEligible(
  kind: DiscountKind,
  birthDate: DateOnly,
  validFrom: DateOnly,
): boolean {
  switch (kind) {
    case DiscountKind.NONE:
      return true;
    case DiscountKind.JUNIOR:
      return ageOn(birthDate, validFrom) < DISCOUNT_AGE.JUNIOR_BELOW;
    case DiscountKind.SENIOR:
      return ageOn(birthDate, validFrom) >= DISCOUNT_AGE.SENIOR_FROM;
  }
}

/** Body of `POST /permits`. The date window (BR-09, the upper bound) needs today: the API checks it. */
export const purchasePermitSchema = z.object({
  permitTypeId: z.uuid(),
  validFrom: z.iso.date(),
});
export type PurchasePermitInput = z.infer<typeof purchasePermitSchema>;

/** Issue messages of `permitStartFormSchema`, which the form translates. */
export const PermitStartIssue = {
  INVALID: 'INVALID',
  IN_PAST: 'IN_PAST',
  TOO_LATE: 'TOO_LATE',
} as const;
export type PermitStartIssue = (typeof PermitStartIssue)[keyof typeof PermitStartIssue];

/** The purchase form: a calendar date from `today` (Warsaw) to `latestPermitStart(today)`. */
export function permitStartFormSchema(today: DateOnly) {
  const latest = latestPermitStart(today);
  return z.object({
    validFrom: z.iso
      .date({ message: PermitStartIssue.INVALID })
      .refine((date) => date >= today, { message: PermitStartIssue.IN_PAST, abort: true })
      .refine((date) => date <= latest, { message: PermitStartIssue.TOO_LATE }),
  });
}
