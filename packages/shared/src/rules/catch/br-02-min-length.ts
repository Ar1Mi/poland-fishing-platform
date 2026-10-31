import { CatchErrorCode } from '../../errors.js';
import type { CatchRule } from './types.js';

// BR-02: a kept fish is not shorter than the minimum length (wymiar ochronny).

const id = 'BR-02';

export const minLengthRule: CatchRule = {
  id,
  check({ catch: fish, effectiveRule: { minLengthCm } }) {
    if (!fish.kept || minLengthCm === null || fish.lengthCm >= minLengthCm) {
      return null;
    }
    return { code: CatchErrorCode.BELOW_MIN_LENGTH, ruleId: id, details: { minLengthCm } };
  },
};
