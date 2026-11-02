import {
  type CatchFormValues,
  catchEditableUntil,
  isCatchEditable,
  warsawDateTimeLocal,
} from '@lowisko/shared';
import { CircleAlert, CircleCheck, CloudUpload, Info, LoaderCircle, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDateTime } from '../../../shared/lib/format';
import { syncCatchQueue } from '../../../shared/offline/catch-queue';
import type { QueuedCatch } from '../../../shared/offline/db';
import { refreshAndSync } from '../../../shared/offline/device-data';
import {
  type DeviceData,
  useDeviceData,
  useDeviceRefresh,
  useQueuedCatch,
  useQueuedCatches,
} from '../../../shared/offline/use-device';
import { useOnline } from '../../../shared/offline/use-online';
import { enqueueCatch } from '../../../shared/offline/catch-queue';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent } from '../../../shared/ui/card';
import { useCurrentUserId, useSessionStatus } from '../../auth/api/useAuth';
import { type Catch, type NewCatch, useMyCatches } from '../api/useCatches';
import { CatchForm, type CatchFormSubmit } from '../components/CatchForm';
import { RuleAlerts } from '../components/RuleAlerts';
import { catchPlaces, readLastChoice, rememberChoice } from '../lib/catch-form';
import { newClientId } from '../lib/client-id';
import { checkOnDevice, recordablePermits, sameDayKeptOf } from '../lib/device-check';

/**
 * `/catch/new` (FR-11, FR-13, NFR-06): the form, then the verdict — two screens. It works from
 * what the device holds (ADR-0009): `validateCatch` checks the catch while it is entered, the
 * catch goes to the queue on the device, and with network straight on to the server.
 */
export function NewCatchPage() {
  const { t } = useTranslation();
  const userId = useCurrentUserId();
  const device = useDeviceData(userId);
  const queue = useQueuedCatches(userId);
  const refresh = useDeviceRefresh();
  const online = useOnline();
  const connected = useSessionStatus() === 'authenticated' && online;
  // The server's register also has the catches of the angler's other phones.
  const server = useMyCatches(undefined, { enabled: connected });
  const loading =
    device === undefined ||
    queue === undefined ||
    (device === null && refresh.status === 'running');

  return (
    <>
      <h1 className="text-h1">{t('catches.form.title')}</h1>
      {!connected && (
        <Alert variant="warning">
          <WifiOff aria-hidden />
          <AlertTitle>{t('catches.offline.title')}</AlertTitle>
          <AlertDescription className="text-body">{t('catches.offline.text')}</AlertDescription>
        </Alert>
      )}
      {loading && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catches.form.loading')}
        </Badge>
      )}
      {!loading && device === null && (
        <NoDeviceData
          error={refresh.status === 'failed' ? refresh.error : null}
          canFetch={connected}
        />
      )}
      {!loading && device && queue && userId && (
        <Recorder
          userId={userId}
          device={device}
          queue={queue}
          server={server.data}
          connected={connected}
        />
      )}
    </>
  );
}

/** The device holds nothing of this user yet: fetched on open and login, so it failed or waits. */
function NoDeviceData({ error, canFetch }: { error: unknown; canFetch: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {error ? (
        <ApiErrorAlert error={error} />
      ) : (
        <Alert variant="warning">
          <Info aria-hidden />
          <AlertDescription className="text-body">
            {t('catches.form.noDeviceData')}
          </AlertDescription>
        </Alert>
      )}
      {canFetch && (
        <Button variant="secondary" className="w-fit" onClick={() => void refreshAndSync()}>
          {t('catches.form.fetchDeviceData')}
        </Button>
      )}
    </>
  );
}

function Recorder({
  userId,
  device,
  queue,
  server,
  connected,
}: {
  userId: string;
  device: DeviceData;
  queue: QueuedCatch[];
  server: Catch[] | undefined;
  connected: boolean;
}) {
  const { t } = useTranslation();
  // One id per catch on screen: sent again after a lost answer, it is not a second catch.
  const [clientId, setClientId] = useState(newClientId);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const permits = recordablePermits(device.permits, new Date());
  const places = catchPlaces(permits);

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

  if (saved) {
    return (
      <SavedCatch
        clientId={saved}
        userId={userId}
        connected={connected}
        onAnother={() => {
          setSaved(null);
          setClientId(newClientId());
        }}
      />
    );
  }

  const check = ({ place, ...fish }: CatchFormSubmit) => {
    const permit = permits.find((item) => item.id === place.permitId);
    return permit
      ? checkOnDevice(
          {
            speciesId: fish.speciesId,
            fishingWaterId: place.waterId,
            caughtAt: fish.caughtAt,
            lengthCm: fish.lengthCm,
            weightG: fish.weightG,
            kept: fish.kept,
          },
          permit,
          device,
          sameDayKeptOf(server, queue),
          new Date(),
        )
      : [];
  };

  const onSubmit = ({ place, position, ...fish }: CatchFormSubmit) => {
    rememberChoice({ place: place.key, speciesId: fish.speciesId });
    const item: NewCatch = {
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
    };
    enqueueCatch(userId, item, new Date()).then(
      () => {
        setSaveError(false);
        setSaved(clientId);
      },
      () => setSaveError(true),
    );
  };

  const last = readLastChoice();
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <CatchForm
          key={clientId}
          places={places}
          species={device.species}
          initial={{
            place: last?.place,
            speciesId: device.species.some((item) => item.id === last?.speciesId)
              ? last!.speciesId
              : '',
            // Kept or released is never preset: the angler chooses (CatchFate).
            fate: '' as CatchFormValues['fate'],
            lengthCm: '',
            weightKg: '',
            caughtAt: warsawDateTimeLocal(new Date()),
          }}
          submitLabel={t('catches.form.submit')}
          pending={false}
          error={null}
          withLocation
          check={check}
          onSubmit={onSubmit}
        />
        {saveError && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription className="text-body">
              {t('catches.form.deviceError')}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The saved catch as its verdict arrives: on the device, then the server's ACCEPTED or
 * REJECTED, or FAILED when the server refused it as input.
 */
function SavedCatch({
  clientId,
  userId,
  connected,
  onAnother,
}: {
  clientId: string;
  userId: string;
  connected: boolean;
  onAnother: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const row = useQueuedCatch(clientId);
  const heading = useRef<HTMLHeadingElement>(null);
  const [sending, setSending] = useState<{ running: boolean; error: unknown }>({
    running: false,
    error: null,
  });
  const send = useCallback(() => {
    setSending({ running: true, error: null });
    syncCatchQueue(userId).then(
      ({ error }) => setSending({ running: false, error }),
      (error: unknown) => setSending({ running: false, error }),
    );
  }, [userId]);
  // With network the saved catch goes on to the server at once.
  const sendOnSave = useRef(connected);
  useEffect(() => {
    if (sendOnSave.current) {
      sendOnSave.current = false;
      send();
    }
  }, [send]);
  // The form with the focused button is gone: the verdict takes the focus and is read out.
  const shown = row !== undefined;
  useEffect(() => {
    if (shown) {
      heading.current?.focus();
    }
  }, [shown]);
  if (!row) {
    return null;
  }

  const caughtAt = new Date(row.item.caughtAt);
  // A catch of a day long gone (a wrong date) is stored already past its window.
  const editable = isCatchEditable(caughtAt, new Date());
  const view = {
    PENDING_SYNC: {
      variant: 'info',
      icon: <CloudUpload aria-hidden />,
      title: t('catches.result.saved'),
      text: sending.running
        ? t('catches.result.sending')
        : connected && sending.error
          ? t('catches.result.notSent')
          : t('catches.result.savedText'),
    },
    ACCEPTED: {
      variant: 'success',
      icon: <CircleCheck aria-hidden />,
      title: t('catches.result.accepted'),
      text: t('catches.result.acceptedText'),
    },
    REJECTED: {
      variant: 'destructive',
      icon: <CircleAlert aria-hidden />,
      title: t('catches.result.rejected'),
      text: editable
        ? t('catches.result.rejectedText', {
            until: formatDateTime(catchEditableUntil(caughtAt).toISOString(), locale),
          })
        : t('catches.result.rejectedClosed'),
    },
    FAILED: {
      variant: 'destructive',
      icon: <CircleAlert aria-hidden />,
      title: t('catches.result.failed'),
      text: t('catches.result.failedText'),
    },
  } as const;
  const { variant, icon, title, text } = view[row.status];

  return (
    <>
      {/* One heading for every state: it keeps the focus while the verdict arrives. */}
      <Alert variant={variant} aria-live="polite">
        {icon}
        <h2
          ref={heading}
          tabIndex={-1}
          className="col-start-2 text-body font-semibold focus:outline-none"
        >
          {title}
        </h2>
        <AlertDescription className="text-body">{text}</AlertDescription>
      </Alert>
      {row.status === 'REJECTED' && <RuleAlerts violations={row.violations} />}
      {row.status === 'PENDING_SYNC' && connected && Boolean(sending.error) && (
        <ApiErrorAlert error={sending.error} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onAnother}>{t('catches.result.another')}</Button>
        {row.status === 'PENDING_SYNC' && connected && (
          <Button variant="secondary" disabled={sending.running} onClick={send}>
            {sending.running && <LoaderCircle aria-hidden className="animate-spin" />}
            {t('catches.result.sendNow')}
          </Button>
        )}
        <Link to="/me/catches" className="flex min-h-11 items-center font-semibold text-primary">
          {t('catches.result.toRegister')}
        </Link>
      </div>
    </>
  );
}
