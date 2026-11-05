import { z } from 'zod';
import { CATCH_SEASONS } from '../catches/catch-input.js';
import {
  CLAIM_PROOF_EXTENSIONS,
  CLAIM_PROOF_MAX_BYTES,
  CLAIM_PROOF_MIME_TYPES,
  claimProofTypeOf,
  isClaimProofMimeType,
} from '../claims/claims.js';
import { PermitStatus } from '../enums.js';
import type { DateOnly } from '../time/warsaw.js';
import { EffectivePermitStatus, effectivePermitStatus } from './effective-status.js';
import { PERMIT_START_MAX_DAYS_AHEAD, addDays } from './purchase.js';

// External permits (FR-26): bought outside the platform and typed in by the angler, so that
// catches on unconnected waters go to the register too. The API validates the same limits
// with class-validator DTOs; the date window needs today, so both call `externalPermitDatesIssue`.

export const EXTERNAL_PERMIT_ISSUER_MAX_LENGTH = 200;
export const EXTERNAL_PERMIT_NUMBER_MAX_LENGTH = 64;
/** An external permit of a district (okręg) covers many waters; the angler lists the fished ones. */
export const EXTERNAL_PERMIT_MAX_WATERS = 20;
/** Days from the first to the last, both inclusive: a season permit of a leap year. */
export const EXTERNAL_PERMIT_MAX_DAYS = 366;

/**
 * A photo of the paper permit or the PDF of one bought online: the formats and the limit of
 * every stored file (docs/03-architecture.md → «Файлы»). The API checks the file signature.
 */
export const EXTERNAL_PERMIT_PHOTO_MIME_TYPES = CLAIM_PROOF_MIME_TYPES;
export const EXTERNAL_PERMIT_PHOTO_MAX_BYTES = CLAIM_PROOF_MAX_BYTES;
export type ExternalPermitPhotoType = (typeof EXTERNAL_PERMIT_PHOTO_MIME_TYPES)[number];
/** File extension of each photo type: the stored file and the downloaded copy are named by it. */
export const EXTERNAL_PERMIT_PHOTO_EXTENSIONS: Readonly<Record<ExternalPermitPhotoType, string>> =
  CLAIM_PROOF_EXTENSIONS;
export const isExternalPermitPhotoType: (value: string) => value is ExternalPermitPhotoType =
  isClaimProofMimeType;
/** Photo type of a stored file name (`external-permits/<uuid>.png`); undefined for anything else. */
export const externalPermitPhotoTypeOf: (fileName: string) => ExternalPermitPhotoType | undefined =
  claimProofTypeOf;

/** Status of an external permit: it has no stored one, only its dates (ADR-0005). */
export type ExternalPermitStatus =
  | typeof EffectivePermitStatus.SCHEDULED
  | typeof EffectivePermitStatus.ACTIVE
  | typeof EffectivePermitStatus.EXPIRED;

/** SCHEDULED, ACTIVE or EXPIRED by the Warsaw day of `now`, as BR-01 reads an external permit. */
export function externalPermitStatus(
  permit: { validFrom: DateOnly; validTo: DateOnly },
  now: Date,
): ExternalPermitStatus {
  return effectivePermitStatus(
    { ...permit, status: PermitStatus.PAID },
    now,
  ) as ExternalPermitStatus;
}

/** Why the dates of an external permit are refused; the form translates these. */
export const ExternalPermitDatesIssue = {
  /** The last day is before the first. */
  ORDER: 'ORDER',
  /** Longer than `EXTERNAL_PERMIT_MAX_DAYS`. */
  TOO_LONG: 'TOO_LONG',
  /** Starts later than `PERMIT_START_MAX_DAYS_AHEAD` after today: a typo in the year. */
  TOO_LATE: 'TOO_LATE',
  /** A day outside `CATCH_SEASONS`: catches on it could be neither listed nor deleted. */
  OUT_OF_SEASONS: 'OUT_OF_SEASONS',
} as const;
export type ExternalPermitDatesIssue =
  (typeof ExternalPermitDatesIssue)[keyof typeof ExternalPermitDatesIssue];

const yearOf = (date: DateOnly): number => Number(date.slice(0, 4));

/**
 * The first broken rule of the dates of an external permit, or null. A start in the past is
 * allowed: a permit bought earlier is typed in later. `validFrom` and `validTo` are calendar
 * dates, checked before (`z.iso.date()`, `@IsISO8601({ strict: true })`).
 */
export function externalPermitDatesIssue(
  validFrom: DateOnly,
  validTo: DateOnly,
  today: DateOnly,
): ExternalPermitDatesIssue | null {
  const inSeasons = (date: DateOnly) =>
    yearOf(date) >= CATCH_SEASONS.FIRST && yearOf(date) <= CATCH_SEASONS.LAST;
  if (!inSeasons(validFrom) || !inSeasons(validTo)) {
    return ExternalPermitDatesIssue.OUT_OF_SEASONS;
  }
  if (validTo < validFrom) {
    return ExternalPermitDatesIssue.ORDER;
  }
  if (validTo >= addDays(validFrom, EXTERNAL_PERMIT_MAX_DAYS)) {
    return ExternalPermitDatesIssue.TOO_LONG;
  }
  if (validFrom > addDays(today, PERMIT_START_MAX_DAYS_AHEAD)) {
    return ExternalPermitDatesIssue.TOO_LATE;
  }
  return null;
}

const calendarDate = z.iso.date();

/** Issue messages of fields of `externalPermitFormSchema` other than the dates' window. */
export const ExternalPermitFieldIssue = { REQUIRED: 'REQUIRED', INVALID: 'INVALID' } as const;

/**
 * The external permit form; output is the body of `POST /me/external-permits` (a blank number is
 * no number). The dates' issue is reported on `validTo`, with an `ExternalPermitDatesIssue`.
 */
export function externalPermitFormSchema(today: DateOnly) {
  return z
    .object({
      issuerName: z
        .string()
        .trim()
        .min(1, { message: ExternalPermitFieldIssue.REQUIRED })
        .max(EXTERNAL_PERMIT_ISSUER_MAX_LENGTH, { message: ExternalPermitFieldIssue.INVALID }),
      number: z
        .string()
        .trim()
        .max(EXTERNAL_PERMIT_NUMBER_MAX_LENGTH, { message: ExternalPermitFieldIssue.INVALID })
        .transform((text) => (text === '' ? null : text)),
      validFrom: z.iso.date({ message: ExternalPermitFieldIssue.INVALID }),
      validTo: z.iso.date({ message: ExternalPermitFieldIssue.INVALID }),
      waterIds: z
        .array(z.uuid())
        .min(1, { message: ExternalPermitFieldIssue.REQUIRED })
        .max(EXTERNAL_PERMIT_MAX_WATERS, { message: ExternalPermitFieldIssue.INVALID }),
    })
    .superRefine(({ validFrom, validTo }, context) => {
      // It runs despite the issues of the fields: the window is checked only on real dates.
      if (!calendarDate.safeParse(validFrom).success || !calendarDate.safeParse(validTo).success) {
        return;
      }
      const issue = externalPermitDatesIssue(validFrom, validTo, today);
      if (issue) {
        context.addIssue({ code: 'custom', path: ['validTo'], message: issue });
      }
    });
}
export type ExternalPermitFormValues = z.input<ReturnType<typeof externalPermitFormSchema>>;
export type ExternalPermitInput = z.output<ReturnType<typeof externalPermitFormSchema>>;
