import {
  WATER_DESCRIPTION_MAX_LENGTH,
  WATER_PHOTO_MAX_BYTES,
  WATER_PHOTO_MIME_TYPES,
  WATER_SEASON_INFO_MAX_LENGTH,
  type WaterProfileFormValues,
  type WaterProfileInput,
  isWaterPhotoType,
  waterProfileSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CircleCheck, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { FileField, TextAreaField } from '../../../shared/ui/form-field';
import {
  useDeleteWaterPhoto,
  useOrgWater,
  useSetWaterPhoto,
  useUpdateWaterProfile,
} from '../api/useWaterProfile';
import { type WaterDetail, waterPhotoUrl } from '../api/useWaters';

/** The upload limit in the hint, in megabytes. */
const PHOTO_MB = WATER_PHOTO_MAX_BYTES / (1024 * 1024);

const backLink = 'flex min-h-11 w-fit items-center gap-2 font-semibold text-primary';

/**
 * `/org/:orgId/waters/:waterId` (FR-05): what the organization tells anglers on the water card —
 * description, season and photo. Name, type and position come from the catalogue import and are
 * not edited here. The API decides whether the water belongs to the organization; the form reads
 * the stored values (`useOrgWater`) and sends only what was changed.
 */
export function OrgWaterPage() {
  const { t } = useTranslation();
  const { orgId = '', waterId = '' } = useParams();
  const water = useOrgWater(orgId, waterId);
  return (
    <>
      <Link to={`/org/${orgId}/waters`} className={backLink}>
        <ArrowLeft aria-hidden className="size-5" />
        {t('catalog.orgWater.back')}
      </Link>
      {water.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catalog.water.loading')}
        </Badge>
      )}
      {water.isError && <ApiErrorAlert error={water.error} />}
      {water.isSuccess && (
        <>
          <h1 className="text-h1">{water.data.name}</h1>
          <p className="text-small text-muted-foreground">{t('catalog.orgWater.lead')}</p>
          <ProfileForm orgId={orgId} water={water.data} />
          <PhotoCard orgId={orgId} water={water.data} />
          <Link to={`/waters/${water.data.id}`} className={backLink}>
            {t('catalog.orgWater.toCard')}
          </Link>
        </>
      )}
    </>
  );
}

function ProfileForm({ orgId, water }: { orgId: string; water: WaterDetail }) {
  const { t } = useTranslation();
  const update = useUpdateWaterProfile(orgId, water.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, dirtyFields },
    reset,
  } = useForm<WaterProfileFormValues, unknown, WaterProfileInput>({
    resolver: zodResolver(waterProfileSchema),
    defaultValues: { description: water.description ?? '', seasonInfo: water.seasonInfo ?? '' },
  });
  // Only the changed fields: another admin may have changed the other one meanwhile.
  const submit = (values: WaterProfileInput) =>
    update.mutate(
      {
        ...(dirtyFields.description && { description: values.description }),
        ...(dirtyFields.seasonInfo && { seasonInfo: values.seasonInfo }),
      },
      {
        onSuccess: (saved) =>
          reset({ description: saved.description ?? '', seasonInfo: saved.seasonInfo ?? '' }),
      },
    );
  return (
    <form
      noValidate
      aria-labelledby="profile-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <h2 id="profile-title" className="text-h2">
        {t('catalog.orgWater.profileTitle')}
      </h2>
      <TextAreaField
        label={t('catalog.orgWater.season')}
        hint={t('catalog.orgWater.seasonHint', { max: WATER_SEASON_INFO_MAX_LENGTH })}
        rows={2}
        maxLength={WATER_SEASON_INFO_MAX_LENGTH}
        error={errors.seasonInfo && t('catalog.orgWater.tooLong')}
        {...register('seasonInfo')}
      />
      <TextAreaField
        label={t('catalog.orgWater.description')}
        rows={6}
        maxLength={WATER_DESCRIPTION_MAX_LENGTH}
        error={errors.description && t('catalog.orgWater.tooLong')}
        {...register('description')}
      />
      {update.isError && <ApiErrorAlert error={update.error} />}
      {update.isSuccess && !isDirty && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription>{t('catalog.orgWater.saved')}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-fit" disabled={update.isPending}>
        {t('catalog.orgWater.save')}
      </Button>
    </form>
  );
}

function PhotoCard({ orgId, water }: { orgId: string; water: WaterDetail }) {
  const { t } = useTranslation();
  const setPhoto = useSetWaterPhoto(orgId, water.id);
  const deletePhoto = useDeleteWaterPhoto(orgId, water.id);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  // Only a quick answer: the API checks the type by the content.
  const choose = (chosen: File | undefined) => {
    setFile(chosen ?? null);
    setFileError(
      chosen && !isWaterPhotoType(chosen.type)
        ? t('catalog.orgWater.photoType')
        : chosen && chosen.size > WATER_PHOTO_MAX_BYTES
          ? t('catalog.orgWater.photoTooBig', { mb: PHOTO_MB })
          : null,
    );
  };
  const error = setPhoto.error ?? deletePhoto.error;
  return (
    <Card aria-labelledby="photo-title">
      <CardHeader>
        <CardTitle id="photo-title">{t('catalog.orgWater.photoTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {water.photoVersion ? (
          <img
            src={waterPhotoUrl(water.id, water.photoVersion)}
            alt={t('catalog.water.photoAlt', { name: water.name })}
            className="aspect-video w-full rounded-lg border border-border object-cover"
          />
        ) : (
          <p className="text-body">{t('catalog.orgWater.noPhoto')}</p>
        )}
        <form
          ref={form}
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (file && !fileError) {
              setPhoto.mutate(file, {
                onSuccess: () => {
                  setFile(null);
                  form.current?.reset();
                },
              });
            }
          }}
        >
          <FileField
            label={
              water.photoVersion
                ? t('catalog.orgWater.replacePhoto')
                : t('catalog.orgWater.addPhoto')
            }
            hint={t('catalog.orgWater.photoHint', { mb: PHOTO_MB })}
            accept={WATER_PHOTO_MIME_TYPES.join(',')}
            error={fileError ?? undefined}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          {error && <ApiErrorAlert error={error} />}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="secondary"
              disabled={!file || fileError !== null || setPhoto.isPending}
            >
              {t('catalog.orgWater.savePhoto')}
            </Button>
            {water.photoVersion && (
              <Button
                type="button"
                variant="destructive"
                disabled={deletePhoto.isPending}
                onClick={() => deletePhoto.mutate()}
              >
                {t('catalog.orgWater.deletePhoto')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
