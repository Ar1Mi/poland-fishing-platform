import { EffectivePermitStatus } from '@lowisko/shared';
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../shared/lib/format';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { formatMonthDay, formatWeight } from '../../rules/lib/format-rule';
import type { RuleViolation } from '../api/useCatches';

/**
 * Why the catch was rejected (docs/10-design-system.md → `RuleAlert`): the translated code with
 * its details, and `BR-xx · CODE` in small print.
 */
export function RuleAlerts({ violations }: { violations: RuleViolation[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {violations.map((violation) => (
        <li key={`${violation.ruleId}-${violation.code}`}>
          <RuleAlert violation={violation} />
        </li>
      ))}
    </ul>
  );
}

function RuleAlert({ violation }: { violation: RuleViolation }) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{t(`catches.violation.${violation.code}.title`)}</AlertTitle>
      <AlertDescription className="text-body">
        <ViolationText violation={violation} />
      </AlertDescription>
      <AlertDescription className="font-mono text-label font-medium">
        {t('catches.violation.code', { ruleId: violation.ruleId, code: violation.code })}
      </AlertDescription>
    </Alert>
  );
}

const STATUSES = new Set<string>(Object.values(EffectivePermitStatus));

function ViolationText({ violation: { code, details = {} } }: { violation: RuleViolation }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  // Details come from the server per code (docs/02-business-rules.md); read them defensively.
  const text = (key: string) => (typeof details[key] === 'string' ? details[key] : '');
  const number = (key: string) => (typeof details[key] === 'number' ? details[key] : 0);
  const date = (key: string) => (text(key) === '' ? '' : formatDate(text(key), locale));

  switch (code) {
    case 'PERMIT_NOT_ACTIVE': {
      const status = text('status');
      return t('catches.violation.PERMIT_NOT_ACTIVE.text', {
        status: STATUSES.has(status) ? t(`permits.status.${status as EffectivePermitStatus}`) : '',
        from: date('validFrom'),
        to: date('validTo'),
      });
    }
    case 'BELOW_MIN_LENGTH':
      return t('catches.violation.BELOW_MIN_LENGTH.text', { cm: number('minLengthCm') });
    case 'CLOSED_SEASON':
      return t('catches.violation.CLOSED_SEASON.text', {
        from: formatMonthDay(text('from'), locale),
        to: formatMonthDay(text('to'), locale),
      });
    case 'DAILY_COUNT_LIMIT':
      return t('catches.violation.DAILY_COUNT_LIMIT.text', {
        kept: number('alreadyKept'),
        limit: number('limit'),
      });
    case 'DAILY_WEIGHT_LIMIT':
      return t('catches.violation.DAILY_WEIGHT_LIMIT.text', {
        kept: formatWeight(number('alreadyKeptG'), locale),
        limit: formatWeight(number('limitG'), locale),
      });
    default:
      return t(`catches.violation.${code}.text`);
  }
}
