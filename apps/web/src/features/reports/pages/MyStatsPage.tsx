import { warsawDate } from '@lowisko/shared';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { SelectField } from '../../../shared/ui/select';
import { useMyStats } from '../api/useMyStats';
import { CatchesCard } from '../components/CatchesCard';

/** How many seasons back the statistics can be browsed, as in the register. */
const SEASONS_SHOWN = 5;

/**
 * `/me/stats` (FR-20): my accepted catches of a season by species and water, on permits of both
 * kinds. The season is in the address (`?season=2025`), the current one without it, like the
 * register it is linked from.
 */
export function MyStatsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const [params, setParams] = useSearchParams();
  const [currentSeason] = useState(() => Number(warsawDate(new Date()).slice(0, 4)));
  const asked = Number(params.get('season'));
  const season =
    Number.isInteger(asked) && asked > currentSeason - SEASONS_SHOWN && asked < currentSeason
      ? asked
      : currentSeason;
  const stats = useMyStats(season === currentSeason ? undefined : season);

  return (
    <>
      <Link
        to={season === currentSeason ? '/me/catches' : `/me/catches?season=${season}`}
        className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary"
      >
        <ArrowLeft aria-hidden className="size-5" />
        {t('reports.myStats.back')}
      </Link>
      <h1 className="text-h1">{t('reports.myStats.title')}</h1>
      <SelectField
        label={t('reports.myStats.season')}
        className="w-32"
        value={season}
        onChange={(event) => {
          const chosen = Number(event.target.value);
          setParams(chosen === currentSeason ? {} : { season: String(chosen) });
        }}
      >
        {Array.from({ length: SEASONS_SHOWN }, (_, back) => currentSeason - back).map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </SelectField>
      {stats.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('reports.stats.loading')}
        </Badge>
      )}
      {stats.isError && <ApiErrorAlert error={stats.error} />}
      {stats.isSuccess && (
        <CatchesCard
          catches={stats.data.catches}
          locale={locale}
          title={t('reports.myStats.catches', { season: stats.data.season })}
          hint={t('reports.myStats.hint')}
        />
      )}
    </>
  );
}
