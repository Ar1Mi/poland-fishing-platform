import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '../../../shared/lib/format';
import { Badge } from '../../../shared/ui/badge';
import type { Species } from '../../rules/api/useRules';
import { formatWeight, speciesName } from '../../rules/lib/format-rule';
import type { Catch } from '../api/useCatches';
import { formatLength } from '../lib/catch-form';
import { RuleAlerts } from './RuleAlerts';

/** The fields of a catch that the summary shows: the register's and the inspection's. */
export type CatchFacts = Pick<
  Catch,
  'speciesId' | 'caughtAt' | 'kept' | 'water' | 'lengthCm' | 'weightG' | 'status' | 'violations'
>;

/**
 * What `CatchRow` shows of a catch (docs/10-design-system.md): species, kept or released and
 * time, length and weight on the right, the water, the status and the reasons of a rejection.
 * Also the read-only list of an inspection (T-19).
 */
export function CatchSummary({ fish, species }: { fish: CatchFacts; species: Species[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const kind = species.find((item) => item.id === fish.speciesId);
  const accepted = fish.status === 'ACCEPTED';
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body font-semibold">
            {kind ? speciesName(kind, i18n.resolvedLanguage) : ''}
          </span>
          <span className="text-small">
            {t('catches.register.fateAndTime', {
              fate: t(`catches.fate.${fish.kept ? 'KEPT' : 'RELEASED'}`),
              time: formatTime(fish.caughtAt, locale),
            })}
          </span>
          <span className="text-small text-muted-foreground">{fish.water.name}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-body">
          <span>{formatLength(fish.lengthCm, locale)}</span>
          {fish.weightG !== null && <span>{formatWeight(fish.weightG, locale)}</span>}
        </div>
      </div>
      <Badge variant={accepted ? 'success' : 'destructive'}>
        {accepted ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
        {t(`catches.status.${fish.status}`)}
      </Badge>
      {!accepted && <RuleAlerts violations={fish.violations} />}
    </>
  );
}
