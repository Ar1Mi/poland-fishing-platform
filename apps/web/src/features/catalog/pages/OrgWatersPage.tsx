import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { matchesQuery } from '../../../shared/lib/search';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { TextField } from '../../../shared/ui/form-field';
import { useOrgWaters } from '../../permits/api/usePermitTypes';

/** More waters than this get a filter by name. */
const FILTER_FROM = 8;

/**
 * `/org/:orgId/waters` (FR-05): the waters connected to the organization, each leading to what
 * the organization tells anglers about it. Without waters — the way to a claim.
 */
export function OrgWatersPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const waters = useOrgWaters(orgId);
  const [query, setQuery] = useState('');
  const shown = waters.data?.filter((water) => matchesQuery(water.name, query)) ?? [];
  return (
    <>
      <h1 className="text-h1">{t('catalog.orgWaters.title')}</h1>
      {waters.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catalog.orgWaters.loading')}
        </Badge>
      )}
      {waters.isError && <ApiErrorAlert error={waters.error} />}
      {waters.isSuccess && waters.data.length === 0 && (
        <>
          <p className="text-body">{t('catalog.orgWaters.empty')}</p>
          <Link
            to={`/org/${orgId}/claims`}
            className="flex min-h-11 w-fit items-center font-semibold text-primary underline"
          >
            {t('catalog.orgWaters.toClaims')}
          </Link>
        </>
      )}
      {waters.isSuccess && waters.data.length > FILTER_FROM && (
        <TextField
          label={t('catalog.orgWaters.filter')}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {waters.isSuccess && waters.data.length > 0 && (
        <ul
          aria-label={t('catalog.orgWaters.title')}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
        >
          {shown.map((water) => (
            <li key={water.id}>
              <Link
                to={`/org/${orgId}/waters/${water.id}`}
                className="flex min-h-12 flex-col justify-center px-4 py-2 text-primary"
              >
                <span className="font-semibold underline">{water.name}</span>
                <span className="text-small text-muted-foreground">
                  {t(`catalog.waterType.${water.type}`)} · {water.region}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {waters.isSuccess && waters.data.length > 0 && shown.length === 0 && (
        <p className="text-body">{t('catalog.orgWaters.noMatch')}</p>
      )}
    </>
  );
}
