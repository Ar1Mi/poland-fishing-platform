import { useTranslation } from 'react-i18next';
import { Card, CardDescription, CardTitle } from '../../../shared/ui/card';
import { useSpecies } from '../../rules/api/useRules';
import { speciesName } from '../../rules/lib/format-rule';
import type { components } from '../../../shared/api/schema';
import { type Bar, BarList } from './BarList';
import { Figure } from './Figure';

export type CatchStats = components['schemas']['CatchStatsDto'];

/**
 * Accepted catches of a period as figures and bars by species and water: the organization's
 * (FR-19) and the angler's own (FR-20) alike.
 */
export function CatchesCard({
  catches,
  locale,
  title,
  hint,
  titleId = 'stats-catches',
}: {
  catches: CatchStats;
  locale: string;
  title: string;
  hint: string;
  titleId?: string;
}) {
  const { t } = useTranslation();
  const species = useSpecies();
  const names = new Map(
    (species.data ?? []).map((kind) => [kind.id, speciesName(kind, locale)] as const),
  );
  const collator = new Intl.Collator(locale);
  const valueText = (count: number, keptCount: number) =>
    t('reports.stats.catches.value', { count, kept: keptCount });
  const bySpecies: Bar[] = catches.bySpecies
    .map(({ speciesId, count, keptCount }) => ({
      id: speciesId,
      label: names.get(speciesId) ?? t('reports.stats.catches.unknownSpecies'),
      value: count,
      valueText: valueText(count, keptCount),
    }))
    .sort((a, b) => b.value - a.value || collator.compare(a.label, b.label));
  return (
    <Card aria-labelledby={titleId}>
      <CardTitle id={titleId}>{title}</CardTitle>
      <CardDescription>{hint}</CardDescription>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure label={t('reports.stats.catches.count')} value={String(catches.count)} />
        <Figure label={t('reports.stats.catches.kept')} value={String(catches.keptCount)} />
        <Figure label={t('reports.stats.catches.released')} value={String(catches.releasedCount)} />
      </dl>
      {catches.count === 0 ? (
        <p className="text-body">{t('reports.stats.catches.empty')}</p>
      ) : (
        <>
          {/* Names come from the dictionary: without it every row would be "unknown" for a moment. */}
          {!species.isPending && (
            <BarList title={t('reports.stats.catches.bySpecies')} bars={bySpecies} />
          )}
          <BarList
            title={t('reports.stats.catches.byWater')}
            bars={catches.byWater.map(({ water, count, keptCount }) => ({
              id: water.id,
              label: water.name,
              value: count,
              valueText: valueText(count, keptCount),
            }))}
          />
        </>
      )}
    </Card>
  );
}
