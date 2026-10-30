import { describe, expect, it } from 'vitest';
import {
  isRuleMonthDay,
  resolveEffectiveRule,
  resolveEffectiveRules,
  ruleFormSchema,
  ruleParametersSchema,
  type SpeciesRuleRow,
} from './species-rules.js';

const PIKE = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f';
const PERCH = '7e8f9a0b-1c2d-4e3f-8a5b-6c7d8e9f0a1b';

const none = {
  minLengthCm: null,
  closedFrom: null,
  closedTo: null,
  dailyLimitCount: null,
  dailyLimitWeightG: null,
};
const rule = (fields: Partial<SpeciesRuleRow>): SpeciesRuleRow => ({
  speciesId: PIKE,
  ...none,
  ...fields,
});

// The three levels of one species, as the seed and an organization would set them.
const general = rule({ minLengthCm: 50, closedFrom: '01-01', closedTo: '04-30' });
const organization = rule({ minLengthCm: 60, dailyLimitCount: 2 });
const water = rule({ minLengthCm: 55, dailyLimitCount: 1, dailyLimitWeightG: 5000 });

describe('resolveEffectiveRule', () => {
  it('has no restriction without rules', () => {
    expect(resolveEffectiveRule([])).toEqual({
      minLengthCm: null,
      dailyLimitCount: null,
      dailyLimitWeightG: null,
      closedPeriods: [],
    });
  });

  it.each([
    ['general', [general], { min: 50, count: null, weight: null, periods: 1 }],
    ['organization', [organization], { min: 60, count: 2, weight: null, periods: 0 }],
    ['water', [water], { min: 55, count: 1, weight: 5000, periods: 0 }],
    [
      'general + organization',
      [general, organization],
      { min: 60, count: 2, weight: null, periods: 1 },
    ],
    ['general + water', [general, water], { min: 55, count: 1, weight: 5000, periods: 1 }],
    [
      'organization + water',
      [organization, water],
      { min: 60, count: 1, weight: 5000, periods: 0 },
    ],
    ['all three', [general, organization, water], { min: 60, count: 1, weight: 5000, periods: 1 }],
  ])('takes the strictest value of %s', (_, rows, expected) => {
    const effective = resolveEffectiveRule(rows);
    expect(effective.minLengthCm).toBe(expected.min);
    expect(effective.dailyLimitCount).toBe(expected.count);
    expect(effective.dailyLimitWeightG).toBe(expected.weight);
    expect(effective.closedPeriods).toHaveLength(expected.periods);
  });

  it('does not depend on the order of the rows', () => {
    expect(resolveEffectiveRule([water, general, organization])).toEqual(
      resolveEffectiveRule([general, organization, water]),
    );
  });

  it('cannot be loosened by a lower level', () => {
    const looser = rule({ minLengthCm: 40, dailyLimitCount: 10 });
    const effective = resolveEffectiveRule([rule({ minLengthCm: 50, dailyLimitCount: 3 }), looser]);
    expect(effective).toMatchObject({ minLengthCm: 50, dailyLimitCount: 3 });
  });

  it('treats null as no limit, not as zero', () => {
    expect(
      resolveEffectiveRule([rule({ dailyLimitCount: null }), rule({ dailyLimitCount: 4 })]),
    ).toMatchObject({ dailyLimitCount: 4 });
  });

  it('keeps a zero limit (no-kill) as the strictest', () => {
    const effective = resolveEffectiveRule([
      rule({ dailyLimitCount: 3, dailyLimitWeightG: 5000 }),
      rule({ dailyLimitCount: 0, dailyLimitWeightG: 0 }),
    ]);
    expect(effective).toMatchObject({ dailyLimitCount: 0, dailyLimitWeightG: 0 });
  });

  it('keeps every closed period, without duplicates, ordered by start', () => {
    const effective = resolveEffectiveRule([
      rule({ closedFrom: '12-01', closedTo: '02-28' }),
      rule({ closedFrom: '01-01', closedTo: '04-30' }),
      rule({ closedFrom: '12-01', closedTo: '02-28' }),
      rule({ closedFrom: '01-01', closedTo: '03-31' }),
    ]);
    expect(effective.closedPeriods).toEqual([
      { from: '01-01', to: '03-31' },
      { from: '01-01', to: '04-30' },
      { from: '12-01', to: '02-28' },
    ]);
  });

  it('refuses rules of different species', () => {
    expect(() => resolveEffectiveRule([general, rule({ speciesId: PERCH })])).toThrow(RangeError);
  });
});

describe('resolveEffectiveRules', () => {
  it('merges each species separately', () => {
    const effective = resolveEffectiveRules([
      general,
      rule({ speciesId: PERCH, dailyLimitCount: 5 }),
      organization,
    ]);
    expect([...effective.keys()]).toEqual([PIKE, PERCH]);
    expect(effective.get(PIKE)).toMatchObject({ minLengthCm: 60, dailyLimitCount: 2 });
    expect(effective.get(PERCH)).toMatchObject({ minLengthCm: null, dailyLimitCount: 5 });
  });
});

describe('isRuleMonthDay', () => {
  it.each(['01-01', '02-28', '04-30', '12-31'])('accepts %s', (value) => {
    expect(isRuleMonthDay(value)).toBe(true);
  });

  it.each(['02-29', '02-30', '04-31', '13-01', '00-10', '01-00', '1-01', '2026-01-01', ''])(
    'rejects %s',
    (value) => {
      expect(isRuleMonthDay(value)).toBe(false);
    },
  );
});

describe('ruleParametersSchema', () => {
  it('accepts a period alone, across New Year and of one day', () => {
    expect(
      ruleParametersSchema.safeParse({ ...none, closedFrom: '12-01', closedTo: '02-28' }).success,
    ).toBe(true);
    expect(
      ruleParametersSchema.safeParse({ ...none, closedFrom: '05-01', closedTo: '05-01' }).success,
    ).toBe(true);
  });

  it('refuses a rule that restricts nothing', () => {
    expect(ruleParametersSchema.safeParse(none).success).toBe(false);
  });

  it('refuses half a period', () => {
    const result = ruleParametersSchema.safeParse({ ...none, closedFrom: '01-01' });
    expect(result.error?.issues[0]?.path).toEqual(['closedTo']);
  });

  it.each([
    { minLengthCm: 0 },
    { minLengthCm: 301 },
    { dailyLimitCount: -1 },
    { dailyLimitCount: 101 },
    { dailyLimitWeightG: 100_001 },
    { minLengthCm: 25.5 },
  ])('refuses %o', (fields) => {
    expect(ruleParametersSchema.safeParse({ ...none, ...fields }).success).toBe(false);
  });
});

describe('ruleFormSchema', () => {
  const form = {
    speciesId: PIKE,
    fishingWaterId: '',
    minLengthCm: '',
    closedFrom: '',
    closedTo: '',
    dailyLimitCount: '',
    dailyLimitWeightG: '',
  };

  it('turns empty fields into no restriction and numbers into integers', () => {
    expect(ruleFormSchema.parse({ ...form, minLengthCm: ' 45 ', dailyLimitCount: '0' })).toEqual({
      speciesId: PIKE,
      fishingWaterId: null,
      ...none,
      minLengthCm: 45,
      dailyLimitCount: 0,
    });
  });

  it('keeps the water of a water rule', () => {
    expect(
      ruleFormSchema.parse({ ...form, fishingWaterId: PERCH, minLengthCm: '30' }),
    ).toMatchObject({ fishingWaterId: PERCH });
  });

  it.each([
    { minLengthCm: '4,5' },
    { minLengthCm: 'abc' },
    { closedFrom: '02-30', closedTo: '03-01' },
  ])('refuses %o', (fields) => {
    expect(ruleFormSchema.safeParse({ ...form, ...fields }).success).toBe(false);
  });

  it('refuses an empty form', () => {
    expect(ruleFormSchema.safeParse(form).success).toBe(false);
  });
});
