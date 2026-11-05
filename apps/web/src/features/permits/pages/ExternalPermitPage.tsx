import {
  EXTERNAL_PERMIT_PHOTO_EXTENSIONS,
  EXTERNAL_PERMIT_PHOTO_MAX_BYTES,
  EXTERNAL_PERMIT_PHOTO_MIME_TYPES,
  isExternalPermitPhotoType,
  warsawDate,
} from '@lowisko/shared';
import {
  ArrowLeft,
  CircleCheck,
  Download,
  FileDown,
  ImageUp,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { useQueuedCatches } from '../../../shared/offline/use-device';
import { saveFile } from '../../../shared/lib/save-file';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/ui/card';
import { FileField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import { useCurrentUserId } from '../../auth/api/useAuth';
import {
  type ExternalPermit,
  useDeleteExternalPermit,
  useDeleteExternalPhoto,
  useExternalPermit,
  useExternalPhoto,
  useExternalRegisterPdf,
  useSetExternalPhoto,
  useUpdateExternalPermit,
} from '../api/useExternalPermits';
import { ExternalPermitForm } from '../components/ExternalPermitForm';
import { PermitStatusBadge } from '../components/PermitStatusBadge';
import type { AddedExternalPermitState } from './NewExternalPermitPage';

/**
 * `/me/external-permits/:id` — an external permit (FR-26): its terms, the photo, the season
 * register for the owner of the water (FR-27), changes and deletion.
 */
export function ExternalPermitPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const permit = useExternalPermit(id);
  const added = useLocation().state as AddedExternalPermitState | null;

  return (
    <>
      <Link
        to="/me/external-permits"
        className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary"
      >
        <ArrowLeft aria-hidden className="size-5" />
        {t('permits.external.detail.back')}
      </Link>
      {permit.isPending && (
        <>
          <h1 className="text-h1">{t('permits.external.detail.title')}</h1>
          <Badge variant="neutral" role="status">
            <LoaderCircle aria-hidden className="animate-spin" />
            {t('permits.external.detail.loading')}
          </Badge>
        </>
      )}
      {permit.isError && (
        <>
          <h1 className="text-h1">{t('permits.external.detail.title')}</h1>
          <ApiErrorAlert error={permit.error} />
        </>
      )}
      {permit.data && (
        <>
          {/* Until a photo is added on this page. */}
          {added?.photoError && permit.data.photoType === null && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              <AlertTitle>{t('permits.external.detail.photoNotAdded')}</AlertTitle>
              <AlertDescription className="text-body">{t(added.photoError)}</AlertDescription>
            </Alert>
          )}
          <Terms permit={permit.data} />
          <Photo permit={permit.data} />
          {/* Changed dates may change the seasons: the choice starts over. */}
          <Register key={`${permit.data.validFrom}:${permit.data.validTo}`} permit={permit.data} />
          <Delete permit={permit.data} />
        </>
      )}
    </>
  );
}

/** The terms of the permit, or the form changing them; the heading stays in both. */
function Terms({ permit }: { permit: ExternalPermit }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const update = useUpdateExternalPermit(permit.id);
  // The focus follows the change: into the form, back onto the button that opened it.
  const editTitle = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (editing) {
      editTitle.current?.focus();
    } else if (opened.current) {
      editButton.current?.focus();
    }
    opened.current = editing;
  }, [editing]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{permit.issuerName}</h1>
        <PermitStatusBadge status={permit.status} />
      </div>
      {saved && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription className="text-body">
            {t('permits.external.detail.saved')}
          </AlertDescription>
        </Alert>
      )}
      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle ref={editTitle} tabIndex={-1} className="focus:outline-none">
              {t('permits.external.detail.editTitle')}
            </CardTitle>
            <CardDescription>{t('permits.external.detail.editLead')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExternalPermitForm
              permit={permit}
              pending={update.isPending}
              error={update.error}
              onSubmit={({ body }) =>
                update.mutate(body, {
                  onSuccess: () => {
                    setEditing(false);
                    setSaved(true);
                  },
                })
              }
              onCancel={() => {
                update.reset();
                setEditing(false);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="caption text-muted-foreground">
                {t('permits.external.detail.number')}
              </dt>
              <dd className="font-mono text-body">
                {permit.number ?? t('permits.external.detail.noNumber')}
              </dd>
              <dt className="caption text-muted-foreground">
                {t('permits.external.detail.validity')}
              </dt>
              <dd className="text-body">
                {t('permits.validity', {
                  from: formatDate(permit.validFrom, locale),
                  to: formatDate(permit.validTo, locale),
                })}
              </dd>
              <dt className="caption text-muted-foreground">
                {t('permits.external.detail.waters')}
              </dt>
              <dd className="text-body">{permit.waters.map((water) => water.name).join(', ')}</dd>
            </dl>
            <p className="text-small text-muted-foreground">
              {t('permits.external.detail.rulesNote')}
            </p>
            <div className="flex flex-wrap gap-2">
              {permit.status === 'ACTIVE' && (
                <Button asChild variant="accent">
                  <Link to="/catch/new">
                    <Plus aria-hidden />
                    {t('catches.links.add')}
                  </Link>
                </Button>
              )}
              <Button
                ref={editButton}
                variant="secondary"
                onClick={() => {
                  setSaved(false);
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden />
                {t('permits.external.detail.edit')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** The photo or scan of the paper permit: shown to an inspector from the phone, if asked. */
function Photo({ permit }: { permit: ExternalPermit }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const upload = useSetExternalPhoto(permit.id);
  const remove = useDeleteExternalPhoto(permit.id);
  const download = useExternalPhoto(permit.id);
  // The removed photo takes its buttons with it: the card's heading gets the focus.
  const title = useRef<HTMLHeadingElement>(null);
  const type = permit.photoType;

  const choose = (chosen: File | undefined) => {
    setFile(chosen ?? null);
    upload.reset();
    // An empty type (unknown to the browser) is left to the API, which reads the content.
    setFileError(
      chosen && chosen.type && !isExternalPermitPhotoType(chosen.type)
        ? t('permits.external.form.photo.type')
        : chosen && chosen.size > EXTERNAL_PERMIT_PHOTO_MAX_BYTES
          ? t('permits.external.form.photo.tooBig')
          : null,
    );
  };

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle ref={title} id={titleId} tabIndex={-1} className="focus:outline-none">
          {t('permits.external.photo.title')}
        </CardTitle>
        <CardDescription>
          {type
            ? type === 'application/pdf'
              ? t('permits.external.photo.hasPdf')
              : t('permits.external.photo.hasImage')
            : t('permits.external.photo.none')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {type && isExternalPermitPhotoType(type) && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={download.isPending}
              onClick={() =>
                download.mutate(undefined, {
                  onSuccess: (blob) =>
                    saveFile(blob, `zezwolenie.${EXTERNAL_PERMIT_PHOTO_EXTENSIONS[type]}`),
                })
              }
            >
              <Download aria-hidden />
              {t('permits.external.photo.download')}
            </Button>
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => title.current?.focus() })}
            >
              <Trash2 aria-hidden />
              {t('permits.external.photo.remove')}
            </Button>
          </div>
        )}
        {download.isError && <ApiErrorAlert error={download.error} />}
        {remove.isError && <ApiErrorAlert error={remove.error} />}
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (file && !fileError) {
              upload.mutate(file, {
                onSuccess: () => {
                  setFile(null);
                  // A new input: the chosen file is not offered again.
                  setInputKey((key) => key + 1);
                },
              });
            }
          }}
        >
          <FileField
            key={inputKey}
            label={type ? t('permits.external.photo.replace') : t('permits.external.photo.add')}
            hint={t('permits.external.form.photo.hint')}
            accept={EXTERNAL_PERMIT_PHOTO_MIME_TYPES.join(',')}
            error={fileError ?? undefined}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          {upload.isError && <ApiErrorAlert error={upload.error} />}
          {upload.isSuccess && (
            <p role="status" className="text-small text-muted-foreground">
              {t('permits.external.photo.saved')}
            </p>
          )}
          <Button
            type="submit"
            variant="secondary"
            className="w-fit"
            disabled={!file || fileError !== null || upload.isPending}
          >
            <ImageUp aria-hidden />
            {t('permits.external.photo.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** The seasons a permit spans: one, or two for a permit running over New Year. */
function seasonsOf(permit: ExternalPermit): number[] {
  const first = Number(permit.validFrom.slice(0, 4));
  const last = Number(permit.validTo.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => last - index);
}

/** The season register (FR-27): what the angler sends to the owner of the water. */
function Register({ permit }: { permit: ExternalPermit }) {
  const { t } = useTranslation();
  const titleId = useId();
  const seasons = seasonsOf(permit);
  const current = Number(warsawDate(new Date()).slice(0, 4));
  const [season, setSeason] = useState(seasons.includes(current) ? current : seasons[0]!);
  const pdf = useExternalRegisterPdf(permit.id);

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{t('permits.external.register.title')}</CardTitle>
        <CardDescription>{t('permits.external.register.lead')}</CardDescription>
      </CardHeader>
      <CardContent>
        {seasons.length > 1 && (
          <SelectField
            label={t('permits.external.register.season')}
            value={season}
            onChange={(event) => setSeason(Number(event.target.value))}
          >
            {seasons.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </SelectField>
        )}
        <Button
          className="w-fit"
          disabled={pdf.isPending}
          onClick={() =>
            pdf.mutate(season, {
              onSuccess: (blob) => saveFile(blob, `rejestr-polowow-${season}.pdf`),
            })
          }
        >
          <FileDown aria-hidden />
          {t('permits.external.register.download', { season })}
        </Button>
        {pdf.isError && <ApiErrorAlert error={pdf.error} />}
      </CardContent>
    </Card>
  );
}

/**
 * Deletion with a second confirmation; a permit with catches stays (EXTERNAL_PERMIT_IN_USE).
 * Catches still waiting on this device are not on the server yet: deleted now, the permit would
 * leave them refused for good (FAILED), so they have to be sent first.
 */
function Delete({ permit }: { permit: ExternalPermit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirmId = useId();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteExternalPermit(permit.id);
  const queue = useQueuedCatches(useCurrentUserId());
  const waiting = queue?.some(
    (row) => row.status === 'PENDING_SYNC' && row.item.externalPermitId === permit.id,
  );
  // The focus follows the change: onto «No» of the question, back onto the button that asked it.
  const confirmNo = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (confirming) {
      confirmNo.current?.focus();
    } else if (asked.current) {
      deleteButton.current?.focus();
    }
    asked.current = confirming;
  }, [confirming]);

  if (waiting) {
    return (
      <Alert variant="info">
        <TriangleAlert aria-hidden />
        <AlertDescription className="flex flex-col gap-1 text-body">
          {t('permits.external.delete.waiting')}
          <Link to="/me/catches" className="flex min-h-11 w-fit items-center font-semibold">
            {t('permits.external.delete.toRegister')}
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={confirmId}>
          <p id={confirmId} className="text-body font-semibold">
            {t('permits.external.delete.confirm', { name: permit.issuerName })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => void navigate('/me/external-permits', { replace: true }),
                  onError: () => setConfirming(false),
                })
              }
            >
              {t('permits.external.delete.yes')}
            </Button>
            <Button ref={confirmNo} variant="secondary" onClick={() => setConfirming(false)}>
              {t('permits.external.delete.no')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={deleteButton}
          variant="ghost"
          className="w-fit text-destructive"
          onClick={() => {
            remove.reset();
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden />
          {t('permits.external.delete.action')}
        </Button>
      )}
      {remove.isError && <ApiErrorAlert error={remove.error} />}
    </div>
  );
}
