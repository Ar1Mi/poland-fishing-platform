import {
  type CatchFormValues,
  catchEditableUntil,
  isCatchEditable,
  warsawDateTimeLocal,
} from '@lowisko/shared';
import { CircleAlert, CircleCheck, Info, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import type { components } from '../../../shared/api/schema';
import { formatDateTime } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent } from '../../../shared/ui/card';
import { useMyPermits } from '../../permits/api/useMyPermits';
import { type Species, useSpecies } from '../../rules/api/useRules';
import { type NewCatch, useRecordCatch } from '../api/useCatches';
import { CatchForm, type CatchFormSubmit } from '../components/CatchForm';
import { RuleAlerts } from '../components/RuleAlerts';
import { type CatchPlace, catchPlaces, readLastChoice, rememberChoice } from '../lib/catch-form';
import { newClientId } from '../lib/client-id';

/** The server's verdict with the time of the catch it is about (the edit window follows from it). */
type Verdict = components['schemas']['SyncCatchResultDto'] & { caughtAt: string };

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
  const [result, setResult] = useState<Verdict | null>(null);
  // One id per catch on screen: sending it again after a lost answer is not a second catch.
  const [clientId, setClientId] = useState(newClientId);
  /**
   * The catch sent without an answer (network, server error): it may be stored under `clientId`.
   * Only this one is sent again — with other data the stored verdict would not match the screen.
   */
  const [unanswered, setUnanswered] = useState<NewCatch | null>(null);

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

  if (result) {
    return (
      <VerdictView
        result={result}
        onAnother={() => {
          setResult(null);
          setClientId(newClientId());
          record.reset();
        }}
      />
    );
  }

  const send = (item: NewCatch) =>
    record.mutate(item, {
      onSuccess: (saved) => {
        setUnanswered(null);
        setResult({ ...saved, caughtAt: item.caughtAt });
      },
      // A 4xx answer stored nothing: the catch may be corrected and sent with the same id.
      onError: (error) => setUnanswered(isAnswered(error) ? null : item),
    });

  const last = readLastChoice();
  const onSubmit = ({ place, position, ...fish }: CatchFormSubmit) => {
    rememberChoice({ place: place.key, speciesId: fish.speciesId });
    send({
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
    });
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
          locked={unanswered !== null}
          onSubmit={onSubmit}
          onRetry={() => unanswered && send(unanswered)}
        />
      </CardContent>
    </Card>
  );
}

/** Whether the server answered with an error of its own (4xx): then nothing was stored. */
function isAnswered(error: unknown): boolean {
  return error instanceof ApiError && error.status !== undefined && error.status < 500;
}

function VerdictView({ result, onAnother }: { result: Verdict; onAnother: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const heading = useRef<HTMLHeadingElement>(null);
  // The form with the focused button is gone: the verdict takes the focus and is read out.
  useEffect(() => heading.current?.focus(), []);
  const accepted = result.status === 'ACCEPTED';
  const editableUntil = catchEditableUntil(new Date(result.caughtAt));
  // A catch of a day long gone (a wrong date) is stored already past its window.
  const editable = isCatchEditable(new Date(result.caughtAt), new Date());

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
            : editable
              ? t('catches.result.rejectedText', {
                  until: formatDateTime(editableUntil.toISOString(), locale),
                })
              : t('catches.result.rejectedClosed')}
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
