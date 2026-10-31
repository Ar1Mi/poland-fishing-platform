import { CatchErrorCode } from '../../errors.js';
import { countedSameDay } from './same-day.js';
import type { CatchRule } from './types.js';

// BR-05: the total weight of kept fish of a species per day stays within the limit.

const id = 'BR-05';

export const dailyWeightRule: CatchRule = {
  id,
  check(ctx) {
    const limitG = ctx.effectiveRule.dailyLimitWeightG;
    const { kept, weightG } = ctx.catch;
    if (!kept || limitG === null) {
      return null;
    }
    // A catch accepted before a weight limit applied may have no weight: it adds nothing.
    const alreadyKeptG = countedSameDay(ctx).reduce((sum, other) => sum + (other.weightG ?? 0), 0);
    // Without its weight (BR-11 asks for it) the fish still weighs something, so it is over the
    // limit once the limit is reached — always at a limit of 0 (no-kill).
    const exceeded = weightG === null ? alreadyKeptG >= limitG : alreadyKeptG + weightG > limitG;
    return exceeded
      ? { code: CatchErrorCode.DAILY_WEIGHT_LIMIT, ruleId: id, details: { limitG, alreadyKeptG } }
      : null;
  },
};
