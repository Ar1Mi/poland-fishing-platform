import { z } from 'zod';

// Fishing rules as data (docs/02-business-rules.md, ADR-0008): bounds of the parameters and
// the merge of the three levels into the effective rule.

/** Upper bounds of rule parameters: guards against typos, far above any real regulation. */
export const RULE_MIN_LENGTH_MAX_CM = 300;
export const RULE_DAILY_COUNT_MAX = 100;
export const RULE_DAILY_WEIGHT_MAX_G = 100_000;

/** Parameters of a `SpeciesRule`; `null` is «no restriction». */
export const RULE_PARAMETERS = [
  'minLengthCm',
  'closedFrom',
  'closedTo',
  'dailyLimitCount',
  'dailyLimitWeightG',
] as const;
export type RuleParameter = (typeof RULE_PARAMETERS)[number];

export interface RuleParameters {
  minLengthCm: number | null;
  /** `MM-DD`, set together with `closedTo`. */
  closedFrom: string | null;
  closedTo: string | null;
  dailyLimitCount: number | null;
  dailyLimitWeightG: number | null;
}

/** One `SpeciesRule` of any level, as the merge needs it. */
export interface SpeciesRuleRow extends RuleParameters {
  speciesId: string;
}

/** A yearly closed period (okres ochronny), both days inclusive; `from > to` wraps over New Year. */
export interface ClosedPeriod {
  from: string;
  to: string;
}

/** The strictest value of each parameter over every level that applies (ADR-0008). */
export interface EffectiveRule {
  minLengthCm: number | null;
  dailyLimitCount: number | null;
  dailyLimitWeightG: number | null;
  /** All periods of all levels: keeping a fish is closed when the day is in any of them. */
  closedPeriods: ClosedPeriod[];
}

const MONTH_DAY = /^(\d{2})-(\d{2})$/;
/** Days per month; February without the 29th — see `isRuleMonthDay`. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Whether `value` is a day of a closed period: `MM-DD` of an existing day. `02-29` is not one:
 * a period ending `02-28` already covers it in a leap year (`isInClosedPeriod`), and a period
 * starting on it would exist only every fourth year.
 */
export function isRuleMonthDay(value: string): boolean {
  const match = MONTH_DAY.exec(value);
  if (!match) {
    return false;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

/**
 * Merges the rules of one species from every level that applies (general, organization,
 * water) into the strictest one: the longest minimum length, the lowest daily limits, every
 * closed period. Order of `rows` does not matter. No rows → no restriction.
 */
export function resolveEffectiveRule(rows: readonly SpeciesRuleRow[]): EffectiveRule {
  const species = new Set(rows.map((row) => row.speciesId));
  if (species.size > 1) {
    throw new RangeError('Rules of different species cannot be merged');
  }
  const periods = new Map<string, ClosedPeriod>();
  for (const { closedFrom: from, closedTo: to } of rows) {
    if (from !== null && to !== null) {
      periods.set(`${from}…${to}`, { from, to });
    }
  }
  return {
    minLengthCm: strictest(rows, 'minLengthCm', Math.max),
    dailyLimitCount: strictest(rows, 'dailyLimitCount', Math.min),
    dailyLimitWeightG: strictest(rows, 'dailyLimitWeightG', Math.min),
    closedPeriods: [...periods.values()].sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
  };
}

/** `resolveEffectiveRule` per species of `rows`. */
export function resolveEffectiveRules(rows: readonly SpeciesRuleRow[]): Map<string, EffectiveRule> {
  const bySpecies = new Map<string, SpeciesRuleRow[]>();
  for (const row of rows) {
    bySpecies.set(row.speciesId, [...(bySpecies.get(row.speciesId) ?? []), row]);
  }
  return new Map(
    [...bySpecies].map(([speciesId, speciesRows]) => [
      speciesId,
      resolveEffectiveRule(speciesRows),
    ]),
  );
}

/** Parameters a higher level can make ineffective; closed periods only add up. */
export const LIMIT_PARAMETERS = ['minLengthCm', 'dailyLimitCount', 'dailyLimitWeightG'] as const;
export type LimitParameter = (typeof LIMIT_PARAMETERS)[number];

/**
 * Parameters of `rule` that do not apply because the rules of the higher levels (`higher`:
 * the general rule for an organization rule; also the organization rules for a water rule)
 * are strictly stricter. Saving such a rule is allowed — the list warns about it.
 */
export function ineffectiveParameters(
  rule: SpeciesRuleRow,
  higher: readonly SpeciesRuleRow[],
): LimitParameter[] {
  const above = resolveEffectiveRule(higher);
  return LIMIT_PARAMETERS.filter((parameter) => {
    const own = rule[parameter];
    const limit = above[parameter];
    if (own === null || limit === null) {
      return false;
    }
    return parameter === 'minLengthCm' ? limit > own : limit < own;
  });
}

function strictest(
  rows: readonly SpeciesRuleRow[],
  parameter: LimitParameter,
  pick: (...values: number[]) => number,
): number | null {
  const values = rows.flatMap((row) => (row[parameter] === null ? [] : [row[parameter]]));
  return values.length === 0 ? null : pick(...values);
}

const minLengthCm = z.int().min(1).max(RULE_MIN_LENGTH_MAX_CM);
// 0 is allowed: a catch-and-release (no-kill) species or water.
const dailyLimitCount = z.int().min(0).max(RULE_DAILY_COUNT_MAX);
const dailyLimitWeightG = z.int().min(0).max(RULE_DAILY_WEIGHT_MAX_G);
const monthDay = z.string().refine(isRuleMonthDay, { message: 'Expected an existing MM-DD' });

/** Checks shared by the API body and the form: a rule restricts something, a period has both ends. */
function refineParameters(rule: RuleParameters, ctx: z.RefinementCtx): void {
  if ((rule.closedFrom === null) !== (rule.closedTo === null)) {
    ctx.addIssue({
      code: 'custom',
      path: [rule.closedFrom === null ? 'closedFrom' : 'closedTo'],
      message: 'A closed period needs both days',
    });
  }
  if (RULE_PARAMETERS.every((parameter) => rule[parameter] === null)) {
    ctx.addIssue({ code: 'custom', path: [], message: 'A rule must restrict something' });
  }
}

/** Parameters of a rule with every field present; `null` is «no restriction». */
export const ruleParametersSchema = z
  .object({
    minLengthCm: minLengthCm.nullable(),
    closedFrom: monthDay.nullable(),
    closedTo: monthDay.nullable(),
    dailyLimitCount: dailyLimitCount.nullable(),
    dailyLimitWeightG: dailyLimitWeightG.nullable(),
  })
  .superRefine(refineParameters);

const optionalNumber = (schema: z.ZodInt) =>
  z
    .string()
    .trim()
    .transform((text) => (text === '' ? null : text))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(/^\d{1,6}$/)
          .transform(Number)
          .pipe(schema),
      ]),
    );

const optionalMonthDay = z
  .string()
  .trim()
  .transform((text) => (text === '' ? null : text))
  .pipe(monthDay.nullable());

/** The rule form of the organization admin: numbers as typed, empty = no restriction. */
export const ruleFormSchema = z
  .object({
    speciesId: z.uuid(),
    /** Empty: the rule of the whole organization. */
    fishingWaterId: z
      .string()
      .transform((id) => (id === '' ? null : id))
      .pipe(z.uuid().nullable()),
    minLengthCm: optionalNumber(minLengthCm),
    closedFrom: optionalMonthDay,
    closedTo: optionalMonthDay,
    dailyLimitCount: optionalNumber(dailyLimitCount),
    dailyLimitWeightG: optionalNumber(dailyLimitWeightG),
  })
  .superRefine(refineParameters);
export type RuleFormValues = z.input<typeof ruleFormSchema>;
export type RuleFormOutput = z.output<typeof ruleFormSchema>;
