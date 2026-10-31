import { CatchErrorCode } from '../../errors.js';
import { isInClosedPeriod } from '../../time/warsaw.js';
import type { CatchRule } from './types.js';

// BR-03: no fish is kept in a closed period (okres ochronny) — any period of any level.

const id = 'BR-03';

export const closedSeasonRule: CatchRule = {
  id,
  check({ catch: fish, effectiveRule: { closedPeriods } }) {
    if (!fish.kept) {
      return null;
    }
    const period = closedPeriods.find(({ from, to }) => isInClosedPeriod(fish.caughtAt, from, to));
    return period
      ? {
          code: CatchErrorCode.CLOSED_SEASON,
          ruleId: id,
          details: { from: period.from, to: period.to },
        }
      : null;
  },
};
