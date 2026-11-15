import { zodResolver } from '@hookform/resolvers/zod';
import {
  REGIONS,
  WATER_NAME_MAX_LENGTH,
  WATER_NAME_MIN_LENGTH,
  type WaterFieldsFormValues,
  type WaterFieldsInput,
  WaterType,
  waterFieldsSchema,
} from '@lowisko/shared';
import { CircleCheck, ExternalLink, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import { AdminNav } from '../../orgs/components/AdminNav';
import {
  type AdminWater,
  useDeleteAdminWater,
  useUpdateAdminWater,
  useWaterSuggestions,
} from '../api/useWaterSuggestions';
import { issueOf } from './SuggestWaterPage';

interface Decision {
  kind: 'published' | 'rejected';
  id: string;
  name: string;
}

/**
 * `/admin/waters` (FR-25): the suggestions of anglers waiting for publication, oldest first.
 * The super admin corrects the name, type or voivodeship and publishes, or rejects (removes)
 * the suggestion after a second confirmation.
 */
export function AdminWatersPage() {
  const { t } = useTranslation();
  const suggestions = useWaterSuggestions();
  const [decision, setDecision] = useState<Decision | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // The decided card leaves the queue with the focused button: the notice takes the focus.
  useEffect(() => {
    if (decision) {
      noticeRef.current?.focus();
    }
  }, [decision]);

  return (
    <>
      <AdminNav />
      <h1 className="text-h1">{t('catalog.adminWaters.title')}</h1>
      <p className="text-muted-foreground">{t('catalog.adminWaters.lead')}</p>
      {decision && (
        <Alert ref={noticeRef} tabIndex={-1} variant="success" className="focus:outline-none">
          <CircleCheck aria-hidden />
          <AlertDescription className="text-body">
            {t(`catalog.adminWaters.${decision.kind}`, { name: decision.name })}
            {decision.kind === 'published' && (
              <>
                {' '}
                <Link
                  to={`/waters/${decision.id}`}
                  className="font-semibold text-primary underline"
                >
                  {t('catalog.adminWaters.toCard')}
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {suggestions.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catalog.adminWaters.loading')}
        </Badge>
      )}
      {suggestions.isError && <ApiErrorAlert error={suggestions.error} />}
      {suggestions.isSuccess && suggestions.data.length === 0 && (
        <p className="text-body">{t('catalog.adminWaters.empty')}</p>
      )}
      {suggestions.isSuccess &&
        suggestions.data.map((water) => (
          <SuggestionCard key={water.id} water={water} onDecided={setDecision} />
        ))}
    </>
  );
}

function SuggestionCard({
  water,
  onDecided,
}: {
  water: AdminWater;
  onDecided: (decision: Decision) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const titleId = useId();
  const confirmId = useId();
  const [confirming, setConfirming] = useState(false);
  // The confirmation replaces the buttons: the focus goes to «Anuluj» and back to «Odrzuć».
  const cancelButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (confirming) {
      cancelButton.current?.focus();
    } else if (opened.current) {
      rejectButton.current?.focus();
    }
    opened.current = confirming;
  }, [confirming]);
  const publish = useUpdateAdminWater();
  const reject = useDeleteAdminWater();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WaterFieldsFormValues, unknown, WaterFieldsInput>({
    resolver: zodResolver(waterFieldsSchema),
    defaultValues: { name: water.name, type: water.type, region: water.region },
  });
  const issue = (message: string | undefined) =>
    message &&
    t(`catalog.suggest.issue.${issueOf(message)}`, {
      min: WATER_NAME_MIN_LENGTH,
      max: WATER_NAME_MAX_LENGTH,
    });
  const pending = publish.isPending || reject.isPending;
  // Only what changed goes to the API: an unchanged field is not a diff in the audit log.
  const onPublish = (fields: WaterFieldsInput) =>
    publish.mutate(
      {
        id: water.id,
        name: fields.name === water.name ? undefined : fields.name,
        type: fields.type === water.type ? undefined : fields.type,
        region: fields.region === water.region ? undefined : fields.region,
        isPublished: true,
      },
      {
        onSuccess: ({ id, name }) => onDecided({ kind: 'published', id, name }),
      },
    );
  const osmUrl =
    water.lat !== null && water.lng !== null
      ? `https://www.openstreetmap.org/?mlat=${water.lat}&mlon=${water.lng}#map=14/${water.lat}/${water.lng}`
      : null;

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{water.name}</CardTitle>
        <p className="text-small text-muted-foreground">
          {t(`catalog.waterType.${water.type}`)} · {water.region}
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
          <dt className="text-muted-foreground">{t('catalog.adminWaters.position')}</dt>
          <dd className="font-mono">
            {water.lat !== null && water.lng !== null
              ? `${water.lat}, ${water.lng}`
              : t('catalog.water.noPosition')}
          </dd>
          <dt className="text-muted-foreground">{t('catalog.adminWaters.submittedAt')}</dt>
          <dd>{formatDate(water.createdAt, locale)}</dd>
        </dl>
        {osmUrl && (
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary underline"
          >
            {t('catalog.adminWaters.openMap')}
            <ExternalLink aria-hidden className="size-4" />
            <span className="sr-only">{t('catalog.water.externalLinkHint')}</span>
          </a>
        )}
        <form
          noValidate
          className="flex flex-col gap-3"
          aria-label={t('catalog.adminWaters.formLabel', { name: water.name })}
          onSubmit={(event) => void handleSubmit(onPublish)(event)}
        >
          <TextField
            label={t('catalog.suggest.name')}
            maxLength={WATER_NAME_MAX_LENGTH}
            error={issue(errors.name?.message)}
            {...register('name')}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label={t('catalog.suggest.type')}
              error={issue(errors.type?.message)}
              {...register('type')}
            >
              {Object.values(WaterType).map((type) => (
                <option key={type} value={type}>
                  {t(`catalog.waterType.${type}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('catalog.suggest.region')}
              error={issue(errors.region?.message)}
              {...register('region')}
            >
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </SelectField>
          </div>
          {publish.isError && <ApiErrorAlert error={publish.error} />}
          {reject.isError && <ApiErrorAlert error={reject.error} />}
          {confirming ? (
            <div className="flex flex-col gap-2" role="group" aria-labelledby={confirmId}>
              <p id={confirmId} className="text-body font-semibold">
                {t('catalog.adminWaters.rejectConfirm')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    reject.mutate(water.id, {
                      onSuccess: () =>
                        onDecided({ kind: 'rejected', id: water.id, name: water.name }),
                    })
                  }
                >
                  {t('catalog.adminWaters.rejectConfirmYes')}
                </Button>
                <Button
                  ref={cancelButton}
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  {t('catalog.adminWaters.rejectConfirmNo')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                <Upload aria-hidden />
                {t('catalog.adminWaters.publish')}
              </Button>
              <Button
                ref={rejectButton}
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                <Trash2 aria-hidden />
                {t('catalog.adminWaters.reject')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
