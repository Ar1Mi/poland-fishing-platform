import { warsawDate } from '../../time/warsaw.js';
import type { CatchContext, SameDayCatch } from './types.js';

/**
 * Catches of `sameDayKept` that count towards the daily limits of the checked one (BR-04, BR-05):
 * kept, of the same species, on the same Warsaw calendar day — not within 24 hours. Which waters
 * they come from is the caller's choice.
 */
export function countedSameDay({ catch: fish, sameDayKept }: CatchContext): SameDayCatch[] {
  const day = warsawDate(fish.caughtAt);
  return sameDayKept.filter(
    (other) =>
      other.kept && other.speciesId === fish.speciesId && warsawDate(other.caughtAt) === day,
  );
}
