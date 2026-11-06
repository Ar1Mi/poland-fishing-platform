import { warsawDate } from '@lowisko/shared';
import { CircleCheck, LoaderCircle, Plus, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { formatDayWithWeekday } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { SelectField } from '../../../shared/ui/select';
import { useOnline } from '../../../shared/offline/use-online';
import { useCurrentUserId, useSessionStatus, useVerifiedUserId } from '../../auth/api/useAuth';
import { useExternalPermits } from '../../permits/api/useExternalPermits';
import { useMyPermits } from '../../permits/api/useMyPermits';
import { useSpecies } from '../../rules/api/useRules';
import { type Catch, useMyCatches } from '../api/useCatches';
import { CatchRow } from '../components/CatchRow';
import { externalPlacePermit, platformPlacePermit } from '../lib/catch-form';
import { DeviceQueue } from '../components/DeviceQueue';

/** How many seasons back the register can be browsed. */
const SEASONS_SHOWN = 5;

/**
 * `/me/catches` (FR-11, FR-12, FR-13): the register of a season by day, latest first, with the
 * reasons of rejected catches; above it the catches still on the device. The season is in the
 * address (`?season=2025`), the current one without it.
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
  const userId = useCurrentUserId();
  const online = useOnline();
  // Without the server only the catches on the device are shown (ADR-0009).
  const connected = useSessionStatus() === 'authenticated' && online;
  // The device's catches are sent only for the user the token belongs to.
  const verifiedId = useVerifiedUserId();
  const canSend = connected && verifiedId === userId;
  const catches = useMyCatches(season === currentSeason ? undefined : season, {
    enabled: connected,
  });
  const species = useSpecies();
  const platformPermits = useMyPermits();
  const externalPermits = useExternalPermits();
  // A catch is corrected on the waters of its own permit, of either kind (T-22).
  const permits =
    platformPermits.data && externalPermits.data
      ? [
          ...platformPermits.data.map(platformPlacePermit),
          ...externalPermits.data.map(externalPlacePermit),
        ]
      : undefined;
  const permitsError = platformPermits.error ?? externalPermits.error;
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
      {userId && <DeviceQueue userId={userId} connected={canSend} />}
      {!connected && (
        <Alert variant="warning">
          <WifiOff aria-hidden />
          <AlertDescription className="text-body">{t('catches.register.offline')}</AlertDescription>
        </Alert>
      )}
      {connected &&
        (catches.isPending ||
          species.isPending ||
          platformPermits.isPending ||
          externalPermits.isPending) && (
          <Badge variant="neutral" role="status">
            <LoaderCircle aria-hidden className="animate-spin" />
            {t('catches.register.loading')}
          </Badge>
        )}
      {connected && (catches.isError || species.isError || permitsError) && (
        <ApiErrorAlert error={catches.error ?? species.error ?? permitsError} />
      )}
      {connected && catches.data?.length === 0 && (
        <p className="text-body">{t('catches.register.empty')}</p>
      )}
      {connected &&
        species.data &&
        permits &&
        days.map(({ day, catches: ofDay }) => (
          <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-3">
            <DayHeading id={`day-${day}`} instant={ofDay[0]!.caughtAt} />
            <ul className="flex flex-col gap-3">
              {ofDay.map((fish) => (
                <li key={fish.id}>
                  <CatchRow
                    fish={fish}
                    species={species.data}
                    permits={permits}
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
