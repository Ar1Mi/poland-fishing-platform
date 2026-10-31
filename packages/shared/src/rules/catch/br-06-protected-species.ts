import { CatchErrorCode } from '../../errors.js';
import type { CatchRule } from './types.js';

// BR-06: a protected species may only be released.

const id = 'BR-06';

export const protectedSpeciesRule: CatchRule = {
  id,
  check({ catch: fish, species }) {
    return fish.kept && species.isProtected
      ? { code: CatchErrorCode.PROTECTED_SPECIES, ruleId: id }
      : null;
  },
};
