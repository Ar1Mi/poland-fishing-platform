import { REGIONS, WATER_QUERY_MAX_LENGTH, WaterStatus, WaterType } from '@lowisko/shared';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import type { WaterQuery } from '../api/useWaters';

export type CatalogFilterValues = Omit<WaterQuery, 'bbox'>;

interface CatalogFiltersProps {
  value: CatalogFilterValues;
  onChange: (value: CatalogFilterValues) => void;
}

/** Name search (applied on submit) and selects (applied at once). */
export function CatalogFilters({ value, onChange }: CatalogFiltersProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(value.q ?? '');
  // Back/forward in the browser changes the URL, and so the applied search.
  useEffect(() => setSearch(value.q ?? ''), [value.q]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ ...value, q: search.trim() || undefined });
  };
  const active = [value.region, value.type, value.status].filter(Boolean).length;
  const select = <K extends keyof CatalogFilterValues>(key: K, selected: string) =>
    onChange({ ...value, [key]: selected || undefined });

  return (
    <div className="flex flex-col gap-3">
      <form role="search" onSubmit={submit} className="flex items-end gap-2">
        <TextField
          type="search"
          className="flex-1"
          label={t('catalog.filters.search')}
          placeholder={t('catalog.filters.searchPlaceholder')}
          maxLength={WATER_QUERY_MAX_LENGTH}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {value.q && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('catalog.filters.clearSearch')}
            onClick={() => {
              setSearch('');
              onChange({ ...value, q: undefined });
            }}
          >
            <X aria-hidden />
          </Button>
        )}
        <Button type="submit" variant="primary">
          <Search aria-hidden />
          {t('catalog.filters.submit')}
        </Button>
      </form>
      {/* Collapsed on the phone so the map stays on the first screen; open when a filter is set. */}
      <details
        open={active > 0 || undefined}
        className="group rounded-lg border border-border bg-card"
      >
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-semibold">
          <SlidersHorizontal aria-hidden className="size-5" />
          {active > 0
            ? t('catalog.filters.titleActive', { count: active })
            : t('catalog.filters.title')}
          <ChevronDown
            aria-hidden
            className="ml-auto size-5 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-3">
          <SelectField
            label={t('catalog.filters.region')}
            value={value.region ?? ''}
            onChange={(event) => select('region', event.target.value)}
          >
            <option value="">{t('catalog.filters.any')}</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('catalog.filters.type')}
            value={value.type ?? ''}
            onChange={(event) => select('type', event.target.value)}
          >
            <option value="">{t('catalog.filters.any')}</option>
            {Object.values(WaterType).map((type) => (
              <option key={type} value={type}>
                {t(`catalog.waterType.${type}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('catalog.filters.status')}
            value={value.status ?? ''}
            onChange={(event) => select('status', event.target.value)}
          >
            <option value="">{t('catalog.filters.any')}</option>
            {Object.values(WaterStatus).map((status) => (
              <option key={status} value={status}>
                {t(`catalog.status.${status}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </details>
    </div>
  );
}
