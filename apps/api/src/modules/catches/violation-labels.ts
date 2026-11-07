import type { CatchErrorCode } from '@lowisko/shared';

/**
 * Why a fish did not meet the rules, as the owner of the water reads it: in the season register
 * PDF (T-22) and the catch export of an organization (T-24). Both are Polish documents for Polish
 * waters, not translated with the interface.
 */
export const VIOLATION_LABEL: Readonly<Record<CatchErrorCode, string>> = {
  PERMIT_NOT_ACTIVE: 'poza terminem zezwolenia',
  PERMIT_WATER_MISMATCH: 'łowisko spoza zezwolenia',
  BELOW_MIN_LENGTH: 'poniżej wymiaru ochronnego',
  CLOSED_SEASON: 'okres ochronny',
  DAILY_COUNT_LIMIT: 'ponad dzienny limit sztuk',
  DAILY_WEIGHT_LIMIT: 'ponad dzienny limit wagi',
  PROTECTED_SPECIES: 'gatunek chroniony',
  CATCH_IN_FUTURE: 'data w przyszłości',
  WEIGHT_REQUIRED: 'brak wagi',
};
