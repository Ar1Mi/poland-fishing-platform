import { CatchErrorCode } from '../../errors.js';
import type { CatchRule } from './types.js';

// BR-10: a catch is not in the future. Checked for released fish too.

/** How far a phone clock may run ahead of the checking one. */
export const CATCH_FUTURE_TOLERANCE_MINUTES = 5;

const id = 'BR-10';

export const catchInFutureRule: CatchRule = {
  id,
  check({ catch: fish, now }) {
    const latest = now.getTime() + CATCH_FUTURE_TOLERANCE_MINUTES * 60_000;
    return fish.caughtAt.getTime() > latest
      ? {
          code: CatchErrorCode.CATCH_IN_FUTURE,
          ruleId: id,
          details: { toleranceMinutes: CATCH_FUTURE_TOLERANCE_MINUTES },
        }
      : null;
  },
};
