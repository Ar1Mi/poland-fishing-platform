import { zodResolver } from '@hookform/resolvers/zod';
import {
  REGIONS,
  WATER_NAME_MAX_LENGTH,
  WATER_NAME_MIN_LENGTH,
  type WaterSuggestionFormValues,
  type WaterSuggestionInput,
  WaterSuggestionIssue,
  WaterType,
  waterSuggestionSchema,
} from '@lowisko/shared';
import { ArrowLeft, CircleCheck, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import { useSuggestWater } from '../api/useWaterSuggestions';
import { PositionPicker } from '../components/PositionPicker';

/** Coordinates are shown with 5 decimals (about 1 m), like the map's bbox. */
const round = (value: number) => Math.round(value * 1e5) / 1e5;

/** The issue of a field as the schema names it; anything else is translated as missing. */
export const issueOf = (message: string): WaterSuggestionIssue =>
  (Object.values(WaterSuggestionIssue) as string[]).includes(message)
    ? (message as WaterSuggestionIssue)
    : WaterSuggestionIssue.REQUIRED;

/**
 * `/waters/suggest` (FR-25): an angler proposes a water the catalogue lacks — name, type,
 * voivodeship and a point on the map. It goes to the super admin's queue; nobody is recorded
 * as its author, so the angler learns of the decision from the map.
 */
export function SuggestWaterPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState<string | null>(null);
  const suggest = useSuggestWater();
  const sentTitle = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (sent) {
      sentTitle.current?.focus();
    }
  }, [sent]);

  return (
    <>
      <Link to="/" className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary">
        <ArrowLeft aria-hidden className="size-5" />
        {t('catalog.suggest.back')}
      </Link>
      <h1 className="text-h1">{t('catalog.suggest.title')}</h1>
      {sent ? (
        <>
          <Alert variant="success">
            <CircleCheck aria-hidden />
            <AlertTitle ref={sentTitle} tabIndex={-1} className="focus:outline-none">
              {t('catalog.suggest.sentTitle')}
            </AlertTitle>
            <AlertDescription className="text-body">
              {t('catalog.suggest.sentText', { name: sent })}
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary">
              <Link to="/">{t('catalog.suggest.toMap')}</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                suggest.reset();
                setSent(null);
              }}
            >
              {t('catalog.suggest.another')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">{t('catalog.suggest.lead')}</p>
          <SuggestionForm
            pending={suggest.isPending}
            error={suggest.error}
            onSubmit={(body) => suggest.mutate(body, { onSuccess: (water) => setSent(water.name) })}
          />
        </>
      )}
    </>
  );
}

function SuggestionForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: unknown;
  onSubmit: (body: WaterSuggestionInput) => void;
}) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<WaterSuggestionFormValues, unknown, WaterSuggestionInput>({
    resolver: zodResolver(waterSuggestionSchema),
    defaultValues: { name: '', type: '', region: '' },
  });
  const lat = watch('lat');
  const lng = watch('lng');
  const position = Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat, lng: lng } : null;
  const place = ({ lat: nextLat, lng: nextLng }: { lat: number; lng: number }) => {
    setValue('lat', round(nextLat), { shouldValidate: isSubmitted });
    setValue('lng', round(nextLng), { shouldValidate: isSubmitted });
  };
  const issue = (message: string | undefined) =>
    message &&
    t(`catalog.suggest.issue.${issueOf(message)}`, {
      min: WATER_NAME_MIN_LENGTH,
      max: WATER_NAME_MAX_LENGTH,
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <TextField
        label={t('catalog.suggest.name')}
        placeholder={t('catalog.suggest.namePlaceholder')}
        maxLength={WATER_NAME_MAX_LENGTH}
        error={issue(errors.name?.message)}
        {...register('name')}
      />
      <SelectField
        label={t('catalog.suggest.type')}
        error={issue(errors.type?.message)}
        {...register('type')}
      >
        <option value="">{t('catalog.suggest.typePlaceholder')}</option>
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
        <option value="">{t('catalog.suggest.regionPlaceholder')}</option>
        {REGIONS.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </SelectField>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-body font-semibold">{t('catalog.suggest.position')}</legend>
        <p className="text-small text-muted-foreground">{t('catalog.suggest.positionHint')}</p>
        <PositionPicker value={position} onChange={place} label={t('catalog.suggest.map')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            type="number"
            inputMode="decimal"
            step="any"
            label={t('catalog.suggest.lat')}
            error={issue(errors.lat?.message)}
            {...register('lat', { valueAsNumber: true })}
          />
          <TextField
            type="number"
            inputMode="decimal"
            step="any"
            label={t('catalog.suggest.lng')}
            error={issue(errors.lng?.message)}
            {...register('lng', { valueAsNumber: true })}
          />
        </div>
      </fieldset>
      {error != null && <ApiErrorAlert error={error} />}
      <Button type="submit" variant="accent" className="w-fit" disabled={pending}>
        <Send aria-hidden />
        {t('catalog.suggest.submit')}
      </Button>
    </form>
  );
}
