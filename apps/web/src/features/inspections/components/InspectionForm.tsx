import {
  INSPECTION_NOTES_MAX_LENGTH,
  type InspectionFormOutput,
  type InspectionFormValues,
  InspectionResult,
  inspectionFormSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { formatTime } from '../../../shared/lib/format';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { TextAreaField } from '../../../shared/ui/form-field';
import { LocationField, useCurrentPosition } from '../../../shared/ui/location-field';
import { SegmentedToggle } from '../../../shared/ui/segmented-toggle';
import { type Inspection, useCreateInspection } from '../api/useInspections';

/**
 * The inspection protocol (FR-18): OK or a violation, notes and, on request, the phone's
 * position. The result must be chosen; after saving, the form gives way to the confirmation.
 */
export function InspectionForm({ orgId, permitId }: { orgId: string; permitId: string }) {
  const { t } = useTranslation();
  const titleId = useId();
  const create = useCreateInspection(orgId);
  const location = useCurrentPosition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InspectionFormValues, unknown, InspectionFormOutput>({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues: { result: '' as InspectionFormValues['result'], notes: '' },
  });

  if (create.data) {
    return <Saved inspection={create.data} />;
  }

  const submit = (values: InspectionFormOutput) =>
    create.mutate({
      permitId,
      ...values,
      lat: location.position?.lat ?? null,
      lng: location.position?.lng ?? null,
    });

  return (
    <form
      noValidate
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <h2 id={titleId} className="text-h2">
        {t('inspections.form.title')}
      </h2>
      <Controller
        control={control}
        name="result"
        render={({ field }) => (
          <SegmentedToggle
            label={t('inspections.form.result.label')}
            options={[
              { value: InspectionResult.OK, label: t('inspections.result.OK') },
              { value: InspectionResult.VIOLATION, label: t('inspections.result.VIOLATION') },
            ]}
            value={field.value}
            onChange={field.onChange}
            focusRef={field.ref}
            error={errors.result && t('inspections.form.result.error')}
          />
        )}
      />
      <TextAreaField
        label={t('inspections.form.notes.label')}
        hint={t('inspections.form.notes.hint', { max: INSPECTION_NOTES_MAX_LENGTH })}
        maxLength={INSPECTION_NOTES_MAX_LENGTH}
        error={errors.notes && t('inspections.form.notes.error')}
        {...register('notes')}
      />
      {location.supported && (
        <LocationField
          location={location}
          labels={{
            add: t('inspections.form.location.add'),
            locating: t('inspections.form.location.locating'),
            added: t('inspections.form.location.added'),
            remove: t('inspections.form.location.remove'),
            failed: t('inspections.form.location.failed'),
          }}
        />
      )}
      {create.isError && <ApiErrorAlert error={create.error} />}
      {/* Saving now would drop the position the inspector asked for. */}
      <Button
        type="submit"
        variant="accent"
        className="w-fit"
        disabled={create.isPending || location.state.status === 'locating'}
      >
        {create.isPending && <LoaderCircle aria-hidden className="animate-spin" />}
        {t('inspections.form.submit')}
      </Button>
    </form>
  );
}

function Saved({ inspection }: { inspection: Inspection }) {
  const { t, i18n } = useTranslation();
  const title = useRef<HTMLParagraphElement>(null);
  // The form with the focused button is gone: the confirmation takes the focus and is read out.
  useEffect(() => title.current?.focus(), []);
  return (
    <Alert variant="success">
      <CircleCheck aria-hidden />
      <AlertTitle ref={title} tabIndex={-1} className="focus:outline-none">
        {t('inspections.form.saved', {
          time: formatTime(inspection.performedAt, i18n.resolvedLanguage ?? 'pl'),
        })}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-1 text-body">
        <p>{t(`inspections.result.${inspection.result}`)}</p>
        {inspection.notes && <p className="whitespace-pre-line">{inspection.notes}</p>}
      </AlertDescription>
    </Alert>
  );
}
