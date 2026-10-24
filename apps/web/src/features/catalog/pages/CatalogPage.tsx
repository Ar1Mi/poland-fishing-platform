import { isRegion, WaterStatus, WaterType } from '@lowisko/shared';
import { LoaderCircle, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { useWaters } from '../api/useWaters';
import { CatalogFilters, type CatalogFilterValues } from '../components/CatalogFilters';
import { WaterCard } from '../components/WaterCard';
import { WatersMap } from '../components/WatersMap';
import { POLAND_BBOX } from '../lib/map';

/** The list renders this many entries; the map shows all of them. */
export const LIST_LIMIT = 100;

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | undefined =>
  values.includes(value as T) ? (value as T) : undefined;

/** Filters live in the URL (shareable, back button); an unknown value is ignored. */
function filtersFrom(params: URLSearchParams): CatalogFilterValues {
  const region = params.get('region');
  return {
    region: isRegion(region) ? region : undefined,
    type: oneOf(Object.values(WaterType), params.get('type')),
    status: oneOf(Object.values(WaterStatus), params.get('status')),
    q: params.get('q')?.trim() || undefined,
  };
}

function toParams(filters: CatalogFilterValues): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

/**
 * Catalogue map with search (FR-06). The map asks only for its viewport; a name search looks
 * through the whole catalogue and zooms the map to the results.
 */
export function CatalogPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const [bbox, setBbox] = useState(POLAND_BBOX);
  const searching = Boolean(filters.q);
  const waters = useWaters({ ...filters, bbox: searching ? undefined : bbox });
  const items = waters.data?.items ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('catalog.page.title')}</h1>
        <p className="text-muted-foreground">{t('catalog.page.lead')}</p>
      </div>
      <CatalogFilters value={filters} onChange={(next) => setParams(toParams(next))} />
      <WatersMap waters={items} onBoundsChange={setBbox} fitToWaters={searching} />
      {waters.isError && <ApiErrorAlert error={waters.error} />}
      {waters.data?.truncated && (
        <Alert variant="warning" role="status">
          <ZoomIn aria-hidden />
          <AlertDescription className="text-body">{t('catalog.page.truncated')}</AlertDescription>
        </Alert>
      )}
      <section aria-labelledby="catalog-results" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="catalog-results" className="text-h2">
            {searching
              ? t('catalog.page.results', { count: items.length })
              : t('catalog.page.resultsInView', { count: items.length })}
          </h2>
          {waters.isFetching && (
            <Badge variant="neutral" role="status">
              <LoaderCircle aria-hidden className="animate-spin" />
              {t('catalog.page.loading')}
            </Badge>
          )}
        </div>
        {waters.isSuccess && items.length === 0 && (
          <p className="text-muted-foreground">{t('catalog.page.empty')}</p>
        )}
        {items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.slice(0, LIST_LIMIT).map((water) => (
              <li key={water.id}>
                <WaterCard water={water} />
              </li>
            ))}
          </ul>
        )}
        {items.length > LIST_LIMIT && (
          <p className="text-small text-muted-foreground">
            {t('catalog.page.shownOf', { shown: LIST_LIMIT, count: items.length })}
          </p>
        )}
      </section>
    </>
  );
}
