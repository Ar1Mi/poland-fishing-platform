import type { LimitParameter } from '@lowisko/shared';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMonthDay, formatWeight } from '../lib/format-rule';

export interface RuleTermsValues {
  minLengthCm: number | null;
  dailyLimitCount: number | null;
  dailyLimitWeightG: number | null;
  closedPeriods: { from: string; to: string }[];
}

/**
 * What a rule restricts, one line per parameter. Parameters in `ineffective` are marked: a
 * stricter higher level applies instead (docs/02-business-rules.md).
 */
export function RuleTerms({
  rule,
  ineffective = [],
}: {
  rule: RuleTermsValues;
  ineffective?: LimitParameter[];
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const lines: { key: string; text: string; parameter?: LimitParameter }[] = [];
  if (rule.minLengthCm !== null) {
    lines.push({
      key: 'minLengthCm',
      parameter: 'minLengthCm',
      text: t('rules.terms.minLength', { cm: rule.minLengthCm }),
    });
  }
  for (const period of rule.closedPeriods) {
    lines.push({
      key: `${period.from}-${period.to}`,
      text: t('rules.terms.closedPeriod', {
        from: formatMonthDay(period.from, locale),
        to: formatMonthDay(period.to, locale),
      }),
    });
  }
  if (rule.dailyLimitCount !== null) {
    lines.push({
      key: 'dailyLimitCount',
      parameter: 'dailyLimitCount',
      text:
        rule.dailyLimitCount === 0
          ? t('rules.terms.noKill')
          : t('rules.terms.dailyCount', { count: rule.dailyLimitCount }),
    });
  }
  // Both limits at 0 say the same thing: no-kill once.
  if (
    rule.dailyLimitWeightG !== null &&
    !(rule.dailyLimitWeightG === 0 && rule.dailyLimitCount === 0)
  ) {
    lines.push({
      key: 'dailyLimitWeightG',
      parameter: 'dailyLimitWeightG',
      text:
        rule.dailyLimitWeightG === 0
          ? t('rules.terms.noKill')
          : t('rules.terms.dailyWeight', { weight: formatWeight(rule.dailyLimitWeightG, locale) }),
    });
  }
  return (
    <ul className="flex flex-col gap-1 text-body">
      {lines.map((line) => (
        <li key={line.key}>
          {line.text}
          {line.parameter && ineffective.includes(line.parameter) && (
            <span className="flex items-start gap-1 text-small font-semibold text-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('rules.terms.ineffective')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A stored rule (one period at most) in the shape of `RuleTerms`. */
export function termsOf(rule: {
  minLengthCm: number | null;
  closedFrom: string | null;
  closedTo: string | null;
  dailyLimitCount: number | null;
  dailyLimitWeightG: number | null;
}): RuleTermsValues {
  return {
    minLengthCm: rule.minLengthCm,
    dailyLimitCount: rule.dailyLimitCount,
    dailyLimitWeightG: rule.dailyLimitWeightG,
    closedPeriods:
      rule.closedFrom !== null && rule.closedTo !== null
        ? [{ from: rule.closedFrom, to: rule.closedTo }]
        : [],
  };
}
