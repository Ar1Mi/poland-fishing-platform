import { CatchErrorCode } from '../../errors.js';
import type { CatchRule } from './types.js';

// BR-11: a kept fish needs its weight when a daily weight limit applies to the species — the
// limit cannot be checked otherwise (BR-05). Also at a limit of 0.

const id = 'BR-11';

export const weightRequiredRule: CatchRule = {
  id,
  check({ catch: fish, effectiveRule }) {
    return fish.kept && effectiveRule.dailyLimitWeightG !== null && fish.weightG === null
      ? { code: CatchErrorCode.WEIGHT_REQUIRED, ruleId: id }
      : null;
  },
};
