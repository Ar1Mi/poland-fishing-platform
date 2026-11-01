import {
  CatchFate,
  type CatchFormOutput,
  type CatchFormValues,
  catchFormSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { FieldError, TextField } from '../../../shared/ui/form-field';
import {
  LocationField,
  type Position,
  useCurrentPosition,
} from '../../../shared/ui/location-field';
import { SegmentedToggle } from '../../../shared/ui/segmented-toggle';
import { SelectField } from '../../../shared/ui/select';
import type { Species } from '../../rules/api/useRules';
import { speciesName } from '../../rules/lib/format-rule';
import type { CatchPlace } from '../lib/catch-form';

export interface CatchFormSubmit extends CatchFormOutput {
  place: CatchPlace;
  position: Position | null;
}

/**
 * One screen of the catch (NFR-06: at most 3): where, what, kept or released, size and time.
 * The place is plain state, not a form field: one of `places` is always shown chosen.
 */
export function CatchForm({
  places,
  species,
  initial,
  submitLabel,
  pending,
  error,
  withLocation = false,
  locked = false,
  onSubmit,
  onRetry,
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
  /**
   * The catch was sent and no answer came: it may be stored already. The fields are frozen and
   * only the same catch can be sent again (`onRetry`), so the verdict is about what is shown.
   */
  locked?: boolean;
  onSubmit: (values: CatchFormSubmit) => void;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const [placeKey, setPlaceKey] = useState(initial.place);
  // The permits may be fetched again meanwhile (one expires at midnight): fall back to the first.
  const place = places.find((candidate) => candidate.key === placeKey) ?? places[0]!;
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
      place,
      position: location.position,
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
        <SelectField
          label={t('catches.form.place.label')}
          value={place.key}
          onChange={(event) => setPlaceKey(event.target.value)}
        >
          {places.map((option) => (
            <option key={option.key} value={option.key}>
              {option.permitName
                ? t('catches.form.place.withPermit', {
                    water: option.waterName,
                    permit: option.permitName,
                  })
                : option.waterName}
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
              focusRef={field.ref}
              error={errors.fate && t('catches.form.fate.error')}
            />
          )}
        />
        <div className="grid grid-cols-2 items-start gap-3">
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
            hint={t('catches.form.weight.hint')}
            error={errors.weightKg && t('catches.form.weight.error')}
            {...register('weightKg')}
          />
        </div>
        <TextField
          label={t('catches.form.caughtAt.label')}
          type="datetime-local"
          className="[&_input]:font-mono"
          error={errors.caughtAt && t('catches.form.caughtAt.error')}
          {...register('caughtAt')}
        />
        {withLocation && location.supported && (
          <LocationField
            location={location}
            labels={{
              add: t('catches.form.location.add'),
              locating: t('catches.form.location.locating'),
              added: t('catches.form.location.added'),
              remove: t('catches.form.location.remove'),
              failed: t('catches.form.location.failed'),
            }}
          />
        )}
      </fieldset>
      {Boolean(error) && <ApiErrorAlert error={error} />}
      {locked && <p className="text-body">{t('catches.form.unknownOutcome')}</p>}
      <div className="flex flex-wrap gap-3">
        {locked ? (
          <Button type="button" variant="accent" disabled={pending} onClick={onRetry}>
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {t('catches.form.retry')}
          </Button>
        ) : (
          <Button type="submit" variant="accent" disabled={pending}>
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {submitLabel}
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('catches.form.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
