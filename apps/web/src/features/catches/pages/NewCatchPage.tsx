import { type CatchFormValues, catchEditableUntil, warsawDateTimeLocal } from '@lowisko/shared';
import { CircleAlert, CircleCheck, Info, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { components } from '../../../shared/api/schema';
import { formatDateTime } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent } from '../../../shared/ui/card';
import { useMyPermits } from '../../permits/api/useMyPermits';
import { type Species, useSpecies } from '../../rules/api/useRules';
import { useRecordCatch } from '../api/useCatches';
import { CatchForm, type CatchFormSubmit } from '../components/CatchForm';
import { RuleAlerts } from '../components/RuleAlerts';
import { type CatchPlace, catchPlaces, readLastChoice, rememberChoice } from '../lib/catch-form';

type SyncResult = components['schemas']['SyncCatchResultDto'];

/**
 * `/catch/new` (FR-11, NFR-06): the form, then the server's verdict — two screens. Online for
 * now; the offline queue and the check before sending come with the PWA (T-21).
 */
export function NewCatchPage() {
  const { t } = useTranslation();
  const permits = useMyPermits();
  const species = useSpecies();

  return (
    <>
      <h1 className="text-h1">{t('catches.form.title')}</h1>
      {(permits.isPending || species.isPending) && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catches.form.loading')}
        </Badge>
      )}
      {(permits.isError || species.isError) && (
        <ApiErrorAlert error={permits.error ?? species.error} />
      )}
      {permits.data && species.data && (
        <Recorder
          places={catchPlaces(permits.data.filter((permit) => permit.status === 'ACTIVE'))}
          species={species.data}
        />
      )}
    </>
  );
}

function Recorder({ places, species }: { places: CatchPlace[]; species: Species[] }) {
  const { t } = useTranslation();
  const record = useRecordCatch();
  const [result, setResult] = useState<SyncResult | null>(null);
  // One id per catch on screen: sending it again after a lost answer is not a second catch.
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [caughtAt, setCaughtAt] = useState<Date | null>(null);

  if (places.length === 0) {
    return (
      <>
        <Alert variant="warning">
          <Info aria-hidden />
          <AlertDescription className="text-body">{t('catches.form.noPermit')}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-x-6">
          <Link to="/me/permits" className="flex min-h-11 items-center font-semibold text-primary">
            {t('catches.form.toPermits')}
          </Link>
          <Link to="/" className="flex min-h-11 items-center font-semibold text-primary">
            {t('catches.form.toCatalog')}
          </Link>
        </div>
      </>
    );
  }

  if (result && caughtAt) {
    return (
      <Verdict
        result={result}
        caughtAt={caughtAt}
        onAnother={() => {
          setResult(null);
          setClientId(crypto.randomUUID());
          record.reset();
        }}
      />
    );
  }

  const last = readLastChoice();
  const onSubmit = ({ place, position, ...fish }: CatchFormSubmit) => {
    rememberChoice({ place: place.key, speciesId: fish.speciesId });
    record.mutate(
      {
        clientId,
        permitId: place.permitId,
        externalPermitId: null,
        fishingWaterId: place.waterId,
        speciesId: fish.speciesId,
        caughtAt: fish.caughtAt.toISOString(),
        lengthCm: fish.lengthCm,
        weightG: fish.weightG,
        kept: fish.kept,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
      },
      {
        onSuccess: (saved) => {
          setCaughtAt(fish.caughtAt);
          setResult(saved);
        },
      },
    );
  };

  return (
    <Card>
      <CardContent>
        <CatchForm
          key={clientId}
          places={places}
          species={species}
          initial={{
            place: last?.place,
            speciesId: species.some((item) => item.id === last?.speciesId) ? last!.speciesId : '',
            // Kept or released is never preset: the angler chooses (CatchFate).
            fate: '' as CatchFormValues['fate'],
            lengthCm: '',
            weightKg: '',
            caughtAt: warsawDateTimeLocal(new Date()),
          }}
          submitLabel={t('catches.form.submit')}
          pending={record.isPending}
          error={record.error}
          withLocation
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
}

function Verdict({
  result,
  caughtAt,
  onAnother,
}: {
  result: SyncResult;
  caughtAt: Date;
  onAnother: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const heading = useRef<HTMLHeadingElement>(null);
  // The form with the focused button is gone: the verdict takes the focus and is read out.
  useEffect(() => heading.current?.focus(), []);
  const accepted = result.status === 'ACCEPTED';

  return (
    <>
      <Alert variant={accepted ? 'success' : 'destructive'}>
        {accepted ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
        <h2
          ref={heading}
          tabIndex={-1}
          className="col-start-2 text-body font-semibold focus:outline-none"
        >
          {accepted ? t('catches.result.accepted') : t('catches.result.rejected')}
        </h2>
        <AlertDescription className="text-body">
          {accepted
            ? t('catches.result.acceptedText')
            : t('catches.result.rejectedText', {
                until: formatDateTime(catchEditableUntil(caughtAt).toISOString(), locale),
              })}
        </AlertDescription>
      </Alert>
      {!accepted && <RuleAlerts violations={result.violations} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onAnother}>{t('catches.result.another')}</Button>
        <Link to="/me/catches" className="flex min-h-11 items-center font-semibold text-primary">
          {t('catches.result.toRegister')}
        </Link>
      </div>
    </>
  );
}
