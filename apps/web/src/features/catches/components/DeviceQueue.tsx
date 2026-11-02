import { CircleX, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type ApiErrorCode, errorMessageKey } from '../../../shared/api/errors';
import { formatDateTime } from '../../../shared/lib/format';
import { removeQueued, syncCatchQueue } from '../../../shared/offline/catch-queue';
import type { QueuedCatch } from '../../../shared/offline/db';
import { useDeviceData, useQueuedCatches } from '../../../shared/offline/use-device';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { formatWeight, speciesName } from '../../rules/lib/format-rule';
import { formatLength } from '../lib/catch-form';

/**
 * Catches recorded on this device that the server does not have (FR-13): waiting for the
 * network (`pendingSync`, dashed), or refused as input and only waiting to be removed.
 */
export function DeviceQueue({ userId, connected }: { userId: string; connected: boolean }) {
  const { t, i18n } = useTranslation();
  const queue = useQueuedCatches(userId);
  const device = useDeviceData(userId);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<unknown>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = (queue ?? [])
    .filter((row) => row.status === 'PENDING_SYNC' || row.status === 'FAILED')
    .sort((a, b) => b.item.caughtAt.localeCompare(a.item.caughtAt));
  if (rows.length === 0) {
    return null;
  }
  const waiting = rows.filter((row) => row.status === 'PENDING_SYNC').length;

  const sync = () => {
    setSyncing(true);
    setSyncError(null);
    void syncCatchQueue(userId)
      .then(({ error }) => setSyncError(error))
      .finally(() => setSyncing(false));
  };

  return (
    <section aria-labelledby="device-queue" className="flex flex-col gap-3">
      <h2 id="device-queue" ref={heading} tabIndex={-1} className="text-h2 focus:outline-none">
        {t('catches.queue.title')}
      </h2>
      {waiting > 0 && (
        <p className="text-body">
          {connected
            ? t('catches.queue.waiting', { count: waiting })
            : t('catches.queue.waitingOffline', { count: waiting })}
        </p>
      )}
      {connected && waiting > 0 && (
        <Button variant="secondary" className="w-fit" disabled={syncing} onClick={sync}>
          {syncing ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : (
            <RefreshCw aria-hidden />
          )}
          {t('catches.queue.sync')}
        </Button>
      )}
      {Boolean(syncError) && <ApiErrorAlert error={syncError} />}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.clientId}>
            <QueuedRow
              row={row}
              speciesLabel={(id) => {
                const kind = device?.species.find((item) => item.id === id);
                return kind ? speciesName(kind, i18n.resolvedLanguage) : '';
              }}
              waterName={(id) =>
                device?.permits.flatMap((permit) => permit.waters).find((water) => water.id === id)
                  ?.name ?? ''
              }
              // The row and its buttons are gone: the section keeps the focus.
              onRemoved={() => heading.current?.focus()}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QueuedRow({
  row,
  speciesLabel,
  waterName,
  onRemoved,
}: {
  row: QueuedCatch;
  speciesLabel: (id: string) => string;
  waterName: (id: string) => string;
  onRemoved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const { item } = row;
  const confirmId = useId();
  const [confirming, setConfirming] = useState(false);
  const confirmNo = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    // Onto «Anuluj» when the confirmation opens, back to «Usuń» when it closes.
    if (confirming) {
      opened.current = true;
      confirmNo.current?.focus();
    } else if (opened.current) {
      deleteButton.current?.focus();
    }
  }, [confirming]);
  const name = speciesLabel(item.speciesId);
  const time = formatDateTime(item.caughtAt, locale);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body font-semibold">{name}</span>
          <span className="text-small">
            {t('catches.register.fateAndTime', {
              fate: t(`catches.fate.${item.kept ? 'KEPT' : 'RELEASED'}`),
              time,
            })}
          </span>
          <span className="text-small text-muted-foreground">{waterName(item.fishingWaterId)}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-body">
          <span>{formatLength(item.lengthCm, locale)}</span>
          {item.weightG != null && <span>{formatWeight(item.weightG, locale)}</span>}
        </div>
      </div>
      {row.status === 'PENDING_SYNC' ? (
        <Badge variant="outline">
          <RefreshCw aria-hidden />
          {t('catches.status.PENDING_SYNC')}
        </Badge>
      ) : (
        <>
          <Badge variant="destructive">
            <CircleX aria-hidden />
            {t('catches.status.FAILED')}
          </Badge>
          <p className="text-small">
            {t('catches.queue.failedReason', {
              reason: t(errorMessageKey(new ApiError(row.errorCode as ApiErrorCode, ''))),
            })}
          </p>
        </>
      )}
      {confirming ? (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={confirmId}>
          <p id={confirmId} className="text-body font-semibold">
            {t('catches.queue.deleteConfirm')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="destructive"
              onClick={() => void removeQueued(row.clientId).then(onRemoved)}
            >
              {t('catches.register.deleteConfirmYes')}
            </Button>
            <Button ref={confirmNo} variant="ghost" onClick={() => setConfirming(false)}>
              {t('catches.register.deleteConfirmNo')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={deleteButton}
          variant="destructive"
          className="w-fit"
          aria-label={t('catches.register.deleteLabel', { name, time })}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          {t('catches.register.delete')}
        </Button>
      )}
    </div>
  );
}
