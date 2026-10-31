import { warsawDate } from '@lowisko/shared';
import { CircleCheck, LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { formatDayWithWeekday } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { SelectField } from '../../../shared/ui/select';
import { useMyPermits } from '../../permits/api/useMyPermits';
import { useSpecies } from '../../rules/api/useRules';
import { type Catch, useMyCatches } from '../api/useCatches';
import { CatchRow } from '../components/CatchRow';

/** How many seasons back the register can be browsed. */
const SEASONS_SHOWN = 5;

/**
 * `/me/catches` (FR-11, FR-12): the register of a season by day, latest first, with the reasons
 * of rejected catches. The season is in the address (`?season=2025`), the current one without it.
 */
export function MyCatchesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [currentSeason] = useState(() => Number(warsawDate(new Date()).slice(0, 4)));
  const asked = Number(params.get('season'));
  const season =
    Number.isInteger(asked) && asked > currentSeason - SEASONS_SHOWN && asked < currentSeason
      ? asked
      : currentSeason;
  const catches = useMyCatches(season === currentSeason ? undefined : season);
  const species = useSpecies();
  const permits = useMyPermits();
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // The deleted row took the focused button with it: the notice gets the focus and is read out.
  useEffect(() => {
    if (notice) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  const days = catches.data ? byDay(catches.data) : [];

  return (
    <>
      <h1 className="text-h1">{t('catches.register.title')}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <Button asChild variant="accent">
          <Link to="/catch/new">
            <Plus aria-hidden />
            {t('catches.links.add')}
          </Link>
        </Button>
        <SelectField
          label={t('catches.register.season')}
          className="w-32"
          value={season}
          onChange={(event) => {
            const chosen = Number(event.target.value);
            setNotice(null);
            setParams(chosen === currentSeason ? {} : { season: String(chosen) });
          }}
        >
          {Array.from({ length: SEASONS_SHOWN }, (_, back) => currentSeason - back).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </SelectField>
      </div>
      {notice && (
        <Alert ref={noticeRef} tabIndex={-1} variant="success" className="focus:outline-none">
          <CircleCheck aria-hidden />
          <AlertDescription className="text-body">{notice}</AlertDescription>
        </Alert>
      )}
      {(catches.isPending || species.isPending || permits.isPending) && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catches.register.loading')}
        </Badge>
      )}
      {(catches.isError || species.isError || permits.isError) && (
        <ApiErrorAlert error={catches.error ?? species.error ?? permits.error} />
      )}
      {catches.data?.length === 0 && <p className="text-body">{t('catches.register.empty')}</p>}
      {species.data &&
        permits.data &&
        days.map(({ day, catches: ofDay }) => (
          <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-3">
            <DayHeading id={`day-${day}`} instant={ofDay[0]!.caughtAt} />
            <ul className="flex flex-col gap-3">
              {ofDay.map((fish) => (
                <li key={fish.id}>
                  <CatchRow
                    fish={fish}
                    species={species.data}
                    permits={permits.data}
                    onDeleted={() => setNotice(t('catches.register.deleted'))}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

/** Catches grouped by their Warsaw calendar day, in the order they came (latest first). */
function byDay(catches: Catch[]): { day: string; catches: Catch[] }[] {
  const days = new Map<string, Catch[]>();
  for (const fish of catches) {
    const day = warsawDate(new Date(fish.caughtAt));
    days.set(day, [...(days.get(day) ?? []), fish]);
  }
  return [...days].map(([day, ofDay]) => ({ day, catches: ofDay }));
}

function DayHeading({ id, instant }: { id: string; instant: string }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  return (
    <h2 id={id} className="text-h2 first-letter:uppercase">
      {formatDayWithWeekday(instant, locale)}
    </h2>
  );
}
