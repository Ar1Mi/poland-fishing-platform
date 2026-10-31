import { CatchErrorCode } from '../../errors.js';
import { countedSameDay } from './same-day.js';
import type { CatchRule } from './types.js';

// BR-04: the number of kept fish of a species per day stays within the limit. A limit of 0 is
// catch-and-release only.

const id = 'BR-04';

export const dailyCountRule: CatchRule = {
  id,
  check(ctx) {
    const limit = ctx.effectiveRule.dailyLimitCount;
    if (!ctx.catch.kept || limit === null) {
      return null;
    }
    const alreadyKept = countedSameDay(ctx).length;
    // The checked fish is one more.
    return alreadyKept < limit
      ? null
      : { code: CatchErrorCode.DAILY_COUNT_LIMIT, ruleId: id, details: { limit, alreadyKept } };
  },
};
