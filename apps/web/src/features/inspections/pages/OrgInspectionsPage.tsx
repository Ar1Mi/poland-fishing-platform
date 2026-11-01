import { warsawDate } from '@lowisko/shared';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { formatDateTime } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { SelectField } from '../../../shared/ui/select';
import { type Inspection, useOrgInspections } from '../api/useInspections';

/** How many seasons back the protocols can be browsed. */
const SEASONS_SHOWN = 5;

/**
 * `/org/:orgId/inspections` (FR-18): the protocols of the organization in a season, latest first.
 * The season is in the address (`?season=2025`), the current one without it.
 */
export function OrgInspectionsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [currentSeason] = useState(() => Number(warsawDate(new Date()).slice(0, 4)));
  const asked = Number(params.get('season'));
  const season =
    Number.isInteger(asked) && asked > currentSeason - SEASONS_SHOWN && asked < currentSeason
      ? asked
      : currentSeason;
  const inspections = useOrgInspections(orgId, season === currentSeason ? undefined : season);

  return (
    <>
      <h1 className="text-h1">{t('inspections.list.title')}</h1>
      <SelectField
        label={t('inspections.list.season')}
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
      {inspections.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('inspections.list.loading')}
        </Badge>
      )}
      {inspections.isError && <ApiErrorAlert error={inspections.error} />}
      {inspections.isSuccess && inspections.data.length === 0 && (
        <p className="text-body">{t('inspections.list.empty')}</p>
      )}
      {inspections.isSuccess && inspections.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {inspections.data.map((inspection) => (
            <li key={inspection.id}>
              <InspectionRow inspection={inspection} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function InspectionRow({ inspection }: { inspection: Inspection }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const { permit, inspector } = inspection;
  const ok = inspection.result === 'OK';
  const unknown = t('inspections.list.anonymised');
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-body">
          {formatDateTime(inspection.performedAt, locale)}
        </span>
        <Badge variant={ok ? 'success' : 'destructive'}>
          {ok ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
          {t(`inspections.result.${inspection.result}`)}
        </Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="caption text-muted-foreground">{t('inspections.list.permit')}</dt>
        <dd className="text-body">
          <span className="font-mono">{permit.number}</span> · {permit.permitType.name}
        </dd>
        <dt className="caption text-muted-foreground">{t('inspections.list.holder')}</dt>
        <dd className="text-body">
          {permit.holder ? `${permit.holder.firstName} ${permit.holder.lastName}` : unknown}
        </dd>
        <dt className="caption text-muted-foreground">{t('inspections.list.inspector')}</dt>
        <dd className="text-body">
          {inspector ? `${inspector.firstName} ${inspector.lastName}` : unknown}
        </dd>
      </dl>
      {inspection.notes && <p className="text-body whitespace-pre-line">{inspection.notes}</p>}
    </article>
  );
}
