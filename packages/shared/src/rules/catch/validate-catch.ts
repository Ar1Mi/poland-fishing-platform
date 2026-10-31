import { permitActiveRule, permitWaterRule } from './br-01-permit.js';
import { minLengthRule } from './br-02-min-length.js';
import { closedSeasonRule } from './br-03-closed-season.js';
import { dailyCountRule } from './br-04-daily-count.js';
import { dailyWeightRule } from './br-05-daily-weight.js';
import { protectedSpeciesRule } from './br-06-protected-species.js';
import { catchInFutureRule } from './br-10-catch-in-future.js';
import { weightRequiredRule } from './br-11-weight-required.js';
import type { CatchContext, CatchRule, RuleViolation } from './types.js';

/** Every catch rule, in the order of their IDs; violations come out in this order. */
export const DEFAULT_CATCH_RULES: readonly CatchRule[] = [
  permitActiveRule,
  permitWaterRule,
  minLengthRule,
  closedSeasonRule,
  dailyCountRule,
  dailyWeightRule,
  protectedSpeciesRule,
  catchInFutureRule,
  weightRequiredRule,
];

/**
 * Checks one catch against the rules (FR-12): every violation, not only the first; none — the
 * catch is accepted. Pure, so the offline PWA and the server reach the same verdict.
 */
export function validateCatch(
  ctx: CatchContext,
  rules: readonly CatchRule[] = DEFAULT_CATCH_RULES,
): RuleViolation[] {
  if (ctx.species.id !== ctx.catch.speciesId) {
    throw new RangeError('The species does not match the catch');
  }
  return rules.flatMap((rule) => rule.check(ctx) ?? []);
}
