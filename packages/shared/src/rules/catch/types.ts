import type { PermitStatus } from '../../enums.js';
import type { CatchErrorCode } from '../../errors.js';
import type { DateOnly } from '../../time/warsaw.js';
import type { EffectiveRule } from '../species-rules.js';

// The CatchValidator contract (docs/02-business-rules.md → «CatchValidator»): a pure check of
// one catch against the BR-* rules, the same in the offline PWA and on the server.

/** A catch as the angler records it. */
export interface CatchInput {
  speciesId: string;
  fishingWaterId: string;
  caughtAt: Date;
  lengthCm: number;
  weightG: number | null;
  kept: boolean;
}

/** What the daily limits (BR-04, BR-05) need of another catch of the same user. */
export type SameDayCatch = Pick<CatchInput, 'speciesId' | 'caughtAt' | 'weightG' | 'kept'>;

interface PermitDates {
  /** First valid day, `YYYY-MM-DD` in Europe/Warsaw. */
  validFrom: DateOnly;
  /** Last valid day, inclusive. */
  validTo: DateOnly;
  /** Waters the permit covers: of its type, or listed by the angler for an external one. */
  waterIds: readonly string[];
}

/** The permit the catch is recorded on: bought on the platform or outside it (FR-26). */
export type PermitSnapshot =
  (PermitDates & { kind: 'PLATFORM'; status: PermitStatus }) | (PermitDates & { kind: 'EXTERNAL' });

export interface CatchContext {
  catch: CatchInput;
  permit: PermitSnapshot;
  species: { id: string; isProtected: boolean };
  /** The rule of the catch's species on its water (`resolveEffectiveRule`). */
  effectiveRule: EffectiveRule;
  /**
   * Kept catches of the user that count towards the daily limits, without the checked one.
   * Only those of the same species and the same Warsaw day are counted.
   */
  sameDayKept: readonly SameDayCatch[];
  /** The moment of the check, passed in: the package never reads the clock. */
  now: Date;
}

export interface RuleViolation {
  code: CatchErrorCode;
  /** `BR-xx` of docs/02-business-rules.md. */
  ruleId: string;
  details?: Record<string, unknown>;
}

/** One BR-* check (Strategy): a violation or `null`. */
export interface CatchRule {
  id: string;
  check(ctx: CatchContext): RuleViolation | null;
}
