import { zodResolver } from '@hookform/resolvers/zod';
import {
  CATCH_SEASONS,
  STATS_RANGE_MAX_DAYS,
  seasonRange,
  type StatsRange,
  statsRangeFormSchema,
  type StatsRangeFormValues,
  warsawDate,
} from '@lowisko/shared';
import { ChevronDown, Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { formatPrice } from '../../../shared/lib/format';
import { saveFile } from '../../../shared/lib/save-file';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardDescription, CardTitle } from '../../../shared/ui/card';
import { TextField } from '../../../shared/ui/form-field';
import { speciesName } from '../../rules/lib/format-rule';
import { useSpecies } from '../../rules/api/useRules';
import { type OrgStats, useCatchesCsv, useOrgStats } from '../api/useOrgStats';
import { type Bar, BarList } from '../components/BarList';
import { MonthColumns } from '../components/MonthColumns';

/** The period in the address (`?from=&to=`), or the current season when it is missing or wrong. */
function periodOf(params: URLSearchParams, season: StatsRange): StatsRange {
  const asked = statsRangeFormSchema.safeParse({
    from: params.get('from'),
    to: params.get('to'),
  });
  return asked.success ? asked.data : season;
}

/**
 * `/org/:orgId/stats` (FR-19): sales of the organization and accepted catches on its permits in a
 * period of Warsaw days, as figures and charts, and the catch export as CSV. Access is the API's:
 * its refusal is shown translated, like on the other organization screens.
 */
export function OrgStatsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const { orgId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [season] = useState(() => seasonRange(warsawDate(new Date())));
  const period = periodOf(params, season);
  const stats = useOrgStats(orgId, period);
  const csv = useCatchesCsv(orgId);

  return (
    <>
      <h1 className="text-h1">{t('reports.stats.title')}</h1>
      <PeriodForm
        // A new period in the address (also back and forward) starts the fields over from it.
        key={`${period.from}/${period.to}`}
        period={period}
        onShow={({ from, to }) =>
          setParams(from === season.from && to === season.to ? {} : { from, to })
        }
      />
      {stats.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('reports.stats.loading')}
        </Badge>
      )}
      {stats.isError && <ApiErrorAlert error={stats.error} />}
      {stats.isSuccess && (
        <>
          <SalesCard sales={stats.data.sales} locale={locale} />
          <CatchesCard catches={stats.data.catches} locale={locale} />
          <Card aria-labelledby="stats-export">
            <CardTitle id="stats-export">{t('reports.stats.export.title')}</CardTitle>
            <CardDescription>{t('reports.stats.export.hint')}</CardDescription>
            <Button
              variant="secondary"
              className="w-fit"
              disabled={csv.isPending}
              onClick={() =>
                csv.mutate(period, {
                  onSuccess: (blob) => saveFile(blob, `polowy-${period.from}-${period.to}.csv`),
                })
              }
            >
              <Download aria-hidden />
              {t('reports.stats.export.download')}
            </Button>
            {csv.isError && <ApiErrorAlert error={csv.error} />}
          </Card>
        </>
      )}
    </>
  );
}

function PeriodForm({
  period,
  onShow,
}: {
  period: StatsRange;
  onShow: (period: StatsRange) => void;
}) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StatsRangeFormValues, unknown, StatsRange>({
    resolver: zodResolver(statsRangeFormSchema),
    defaultValues: period,
  });
  return (
    <form
      noValidate
      aria-label={t('reports.stats.period.label')}
      className="flex flex-col gap-4 sm:flex-row sm:items-start"
      onSubmit={(event) => void handleSubmit(onShow)(event)}
    >
      <TextField
        type="date"
        label={t('reports.stats.period.from')}
        className="sm:w-48"
        error={errors.from && t('reports.stats.period.issue.INVALID')}
        {...register('from')}
      />
      <TextField
        type="date"
        label={t('reports.stats.period.to')}
        className="sm:w-48"
        error={
          errors.to &&
          t(`reports.stats.period.issue.${issueKey(errors.to.message)}`, {
            max: STATS_RANGE_MAX_DAYS,
            first: CATCH_SEASONS.FIRST,
            last: CATCH_SEASONS.LAST,
          })
        }
        {...register('to')}
      />
      <Button type="submit" className="w-fit sm:mt-7">
        {t('reports.stats.period.show')}
      </Button>
    </form>
  );
}

const ISSUES = ['INVALID', 'ORDER', 'TOO_LONG', 'OUT_OF_SEASONS'] as const;
const issueKey = (message: string | undefined): (typeof ISSUES)[number] =>
  ISSUES.find((issue) => issue === message) ?? 'INVALID';

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-background p-3">
      <dt className="caption text-muted-foreground">{label}</dt>
      <dd className="font-mono text-h2">{value}</dd>
      {hint && <dd className="text-small text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function SalesCard({ sales, locale }: { sales: OrgStats['sales']; locale: string }) {
  const { t } = useTranslation();
  const monthLong = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const monthNarrow = new Intl.DateTimeFormat(locale, { month: 'narrow', timeZone: 'UTC' });
  const startOf = (month: string) => new Date(`${month}-01T00:00:00.000Z`);
  return (
    <Card aria-labelledby="stats-sales">
      <CardTitle id="stats-sales">{t('reports.stats.sales.title')}</CardTitle>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure label={t('reports.stats.sales.count')} value={String(sales.count)} />
        <Figure
          label={t('reports.stats.sales.revenue')}
          value={formatPrice(sales.revenueGrosze, locale)}
        />
        <Figure
          label={t('reports.stats.sales.revoked')}
          value={String(sales.revokedCount)}
          hint={sales.revokedCount > 0 ? formatPrice(sales.revokedGrosze, locale) : undefined}
        />
      </dl>
      {sales.revokedCount > 0 && (
        <p className="text-small text-muted-foreground">{t('reports.stats.sales.revokedHint')}</p>
      )}
      {sales.count === 0 ? (
        <p className="text-body">{t('reports.stats.sales.empty')}</p>
      ) : (
        <>
          <MonthColumns
            title={t('reports.stats.sales.byMonth')}
            columns={sales.byMonth.map(({ month, count, revenueGrosze }) => ({
              month,
              value: count,
              label: t('reports.stats.sales.monthValue', {
                month: monthLong.format(startOf(month)),
                count,
                revenue: formatPrice(revenueGrosze, locale),
              }),
              shortLabel: monthShort.format(startOf(month)),
              narrowLabel: monthNarrow.format(startOf(month)),
            }))}
          />
          {/* The exact figures for the eye too: the columns show only counts, and only from 640 px. */}
          <details className="group">
            <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 font-semibold text-primary [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden
                className="size-5 transition-transform group-open:rotate-180"
              />
              {t('reports.stats.sales.monthTable.show')}
            </summary>
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="caption py-2 text-left text-muted-foreground">
                    {t('reports.stats.sales.monthTable.month')}
                  </th>
                  <th scope="col" className="caption py-2 text-right text-muted-foreground">
                    {t('reports.stats.sales.monthTable.count')}
                  </th>
                  <th scope="col" className="caption py-2 text-right text-muted-foreground">
                    {t('reports.stats.sales.monthTable.revenue')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.byMonth.map(({ month, count, revenueGrosze }) => (
                  <tr key={month} className="border-b border-border last:border-0">
                    <th scope="row" className="py-2 text-left font-normal">
                      {monthLong.format(startOf(month))}
                    </th>
                    <td className="py-2 text-right font-mono">{count}</td>
                    <td className="py-2 text-right font-mono">
                      {formatPrice(revenueGrosze, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <BarList
            title={t('reports.stats.sales.byType')}
            bars={sales.byPermitType.map(({ permitType, count, revenueGrosze }) => ({
              id: permitType.id,
              label: permitType.name,
              value: revenueGrosze,
              valueText: t('reports.stats.sales.typeValue', {
                count,
                revenue: formatPrice(revenueGrosze, locale),
              }),
            }))}
          />
        </>
      )}
    </Card>
  );
}

function CatchesCard({ catches, locale }: { catches: OrgStats['catches']; locale: string }) {
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
    <Card aria-labelledby="stats-catches">
      <CardTitle id="stats-catches">{t('reports.stats.catches.title')}</CardTitle>
      <CardDescription>{t('reports.stats.catches.hint')}</CardDescription>
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
