import {
  CatchFate,
  type CatchFormOutput,
  type CatchFormValues,
  catchFormSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, LocateFixed, MapPin, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { FieldError, TextField } from '../../../shared/ui/form-field';
import { SegmentedToggle } from '../../../shared/ui/segmented-toggle';
import { SelectField } from '../../../shared/ui/select';
import type { Species } from '../../rules/api/useRules';
import { speciesName } from '../../rules/lib/format-rule';
import type { CatchPlace } from '../lib/catch-form';

export interface Position {
  lat: number;
  lng: number;
}

export interface CatchFormSubmit extends CatchFormOutput {
  place: CatchPlace;
  position: Position | null;
}

/**
 * One screen of the catch (NFR-06: at most 3): where, what, kept or released, size and time.
 * The place is plain state: it always holds one of `places`, so it needs no validation.
 */
export function CatchForm({
  places,
  species,
  initial,
  submitLabel,
  pending,
  error,
  withLocation = false,
  onSubmit,
  onCancel,
}: {
  places: CatchPlace[];
  species: Species[];
  initial: CatchFormValues & { place?: string };
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Offer the phone's position: only when the catch is recorded, not when it is corrected. */
  withLocation?: boolean;
  onSubmit: (values: CatchFormSubmit) => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const [placeKey, setPlaceKey] = useState(
    places.some((place) => place.key === initial.place) ? initial.place! : places[0]!.key,
  );
  const location = useCurrentPosition();
  const language = i18n.resolvedLanguage ?? 'pl';
  // The API sorts by database collation: «Łosoś» would come last and «Płoć» after «Pstrąg».
  const byName = [...species].sort((a, b) =>
    speciesName(a, language).localeCompare(speciesName(b, language), language),
  );
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CatchFormValues, unknown, CatchFormOutput>({
    resolver: zodResolver(catchFormSchema),
    defaultValues: initial,
  });

  const submit = (values: CatchFormOutput) =>
    onSubmit({
      ...values,
      place: places.find((place) => place.key === placeKey)!,
      position: location.state.status === 'added' ? location.state.position : null,
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <SelectField
        label={t('catches.form.place.label')}
        value={placeKey}
        onChange={(event) => setPlaceKey(event.target.value)}
      >
        {places.map((place) => (
          <option key={place.key} value={place.key}>
            {place.permitName
              ? t('catches.form.place.withPermit', {
                  water: place.waterName,
                  permit: place.permitName,
                })
              : place.waterName}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-col gap-1">
        <SelectField
          label={t('catches.form.species.label')}
          aria-invalid={errors.speciesId ? true : undefined}
          aria-describedby={errors.speciesId ? `${formId}-species` : undefined}
          {...register('speciesId')}
        >
          <option value="">{t('catches.form.species.placeholder')}</option>
          {byName.map((item) => (
            <option key={item.id} value={item.id}>
              {speciesName(item, language)}
            </option>
          ))}
        </SelectField>
        {errors.speciesId && (
          <FieldError id={`${formId}-species`}>{t('catches.form.species.error')}</FieldError>
        )}
      </div>
      <Controller
        control={control}
        name="fate"
        render={({ field }) => (
          <SegmentedToggle
            label={t('catches.form.fate.legend')}
            options={[
              { value: CatchFate.KEPT, label: t('catches.fate.KEPT') },
              { value: CatchFate.RELEASED, label: t('catches.fate.RELEASED') },
            ]}
            value={field.value}
            onChange={field.onChange}
            error={errors.fate && t('catches.form.fate.error')}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('catches.form.length.label')}
          inputMode="numeric"
          autoComplete="off"
          className="[&_input]:font-mono"
          error={errors.lengthCm && t('catches.form.length.error')}
          {...register('lengthCm')}
        />
        <TextField
          label={t('catches.form.weight.label')}
          inputMode="decimal"
          autoComplete="off"
          className="[&_input]:font-mono"
          error={errors.weightKg && t('catches.form.weight.error')}
          {...register('weightKg')}
        />
      </div>
      <p className="-mt-2 text-small text-muted-foreground">{t('catches.form.weight.hint')}</p>
      <TextField
        label={t('catches.form.caughtAt.label')}
        type="datetime-local"
        className="[&_input]:font-mono"
        error={errors.caughtAt && t('catches.form.caughtAt.error')}
        {...register('caughtAt')}
      />
      {withLocation && location.supported && <LocationField location={location} />}
      {Boolean(error) && <ApiErrorAlert error={error} />}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('catches.form.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

type LocationState =
  { status: 'idle' | 'locating' | 'failed' } | { status: 'added'; position: Position };

/** About a metre: enough to show the place, no more of the angler's position than needed. */
const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;

function useCurrentPosition() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const locate = () => {
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setState({
          status: 'added',
          position: { lat: round(coords.latitude), lng: round(coords.longitude) },
        }),
      () => setState({ status: 'failed' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  return { supported, state, locate, clear: () => setState({ status: 'idle' }) };
}

function LocationField({ location }: { location: ReturnType<typeof useCurrentPosition> }) {
  const { t } = useTranslation();
  const { state } = location;
  if (state.status === 'added') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1 text-small" role="status">
          <MapPin aria-hidden className="size-4 text-primary" />
          {t('catches.form.location.added')}
        </p>
        <Button type="button" variant="ghost" onClick={location.clear}>
          <X aria-hidden />
          {t('catches.form.location.remove')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        disabled={state.status === 'locating'}
        onClick={location.locate}
      >
        {state.status === 'locating' ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <LocateFixed aria-hidden />
        )}
        {state.status === 'locating'
          ? t('catches.form.location.locating')
          : t('catches.form.location.add')}
      </Button>
      {state.status === 'failed' && (
        <p className="text-small text-muted-foreground" role="status">
          {t('catches.form.location.failed')}
        </p>
      )}
    </div>
  );
}
