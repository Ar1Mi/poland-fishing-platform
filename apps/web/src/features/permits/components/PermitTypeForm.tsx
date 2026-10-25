import {
  DiscountKind,
  type PermitTypeFormValues,
  type PermitTypeInput,
  permitTypeFormSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { formatPriceInput } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { CheckboxField, FieldError, TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import {
  type OrgPermitType,
  type OrgWater,
  useCreatePermitType,
  useUpdatePermitType,
} from '../api/usePermitTypes';
import { PermitTypeTerms } from './PermitTypeTerms';

/**
 * New permit type, or changes to `type`. A sold type (`inUse`) keeps its duration, discount
 * and waters: they are shown, not offered, and only the name and price are sent.
 */
export function PermitTypeForm({
  orgId,
  waters,
  type,
  onSaved,
  onCancel,
}: {
  orgId: string;
  waters: OrgWater[];
  type?: OrgPermitType;
  onSaved: (saved: OrgPermitType) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const titleId = useId();
  const create = useCreatePermitType(orgId);
  const update = useUpdatePermitType(orgId);
  const mutation = type ? update : create;
  const locked = type?.inUse ?? false;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PermitTypeFormValues, unknown, PermitTypeInput>({
    resolver: zodResolver(permitTypeFormSchema),
    defaultValues: type
      ? {
          name: type.name,
          durationDays: String(type.durationDays),
          price: formatPriceInput(type.priceGrosze, locale),
          discountKind: type.discountKind,
          waterIds: type.waters.map((water) => water.id),
        }
      : {
          name: '',
          durationDays: '1',
          price: '',
          discountKind: DiscountKind.NONE,
          // An organization with a single water means that water.
          waterIds: waters.length === 1 ? [waters[0]!.id] : [],
        },
  });

  const onSubmit = (values: PermitTypeInput) => {
    if (!type) {
      create.mutate(values, { onSuccess: onSaved });
    } else {
      const { name, priceGrosze } = values;
      update.mutate(locked ? { id: type.id, name, priceGrosze } : { id: type.id, ...values }, {
        onSuccess: onSaved,
      });
    }
  };

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>
          {type ? t('permits.form.titleEdit', { name: type.name }) : t('permits.form.titleNew')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <TextField
            label={t('permits.form.name.label')}
            placeholder={t('permits.form.name.placeholder')}
            error={errors.name && t('permits.form.name.error')}
            {...register('name')}
          />
          <TextField
            label={t('permits.form.price.label')}
            hint={t('permits.form.price.hint')}
            inputMode="decimal"
            className="[&_input]:font-mono"
            error={errors.price && t('permits.form.price.error')}
            {...register('price')}
          />
          {type && locked ? (
            <LockedTerms type={type} />
          ) : (
            <>
              <TextField
                label={t('permits.form.durationDays.label')}
                hint={t('permits.form.durationDays.hint')}
                inputMode="numeric"
                className="[&_input]:font-mono"
                error={errors.durationDays && t('permits.form.durationDays.error')}
                {...register('durationDays')}
              />
              <SelectField
                label={t('permits.form.discountKind.label')}
                {...register('discountKind')}
              >
                {Object.values(DiscountKind).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`permits.discount.${kind}`)}
                  </option>
                ))}
              </SelectField>
              <Controller
                control={control}
                name="waterIds"
                render={({ field }) => (
                  <WaterChoice
                    waters={waters}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.waterIds && t('permits.form.waters.error')}
                  />
                )}
              />
            </>
          )}
          {mutation.isError && <ApiErrorAlert error={mutation.error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {type ? t('permits.form.submitEdit') : t('permits.form.submitNew')}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('permits.form.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Terms of a sold type, read-only, with the reason they cannot change. */
function LockedTerms({ type }: { type: OrgPermitType }) {
  const { t } = useTranslation();
  return (
    <>
      <Alert variant="info">
        <Lock aria-hidden />
        <AlertDescription className="text-body">{t('permits.form.locked')}</AlertDescription>
      </Alert>
      <dl className="flex flex-col gap-1">
        <dt className="caption text-muted-foreground">{t('permits.form.durationDays.label')}</dt>
        <dd className="text-body">
          <PermitTypeTerms type={type} />
        </dd>
        <dt className="caption text-muted-foreground">{t('permits.form.waters.legend')}</dt>
        <dd className="text-body">{type.waters.map((water) => water.name).join(', ')}</dd>
      </dl>
    </>
  );
}

/** Checkboxes over the organization's connected waters, with «select all» for big districts. */
function WaterChoice({
  waters,
  value,
  onChange,
  error,
}: {
  waters: OrgWater[];
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const errorId = useId();
  const all = waters.length > 0 && waters.every((water) => value.includes(water.id));
  return (
    <fieldset
      className="flex flex-col gap-1"
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
    >
      <legend className="text-body font-semibold">{t('permits.form.waters.legend')}</legend>
      <p id={hintId} className="text-small text-muted-foreground">
        {t('permits.form.waters.hint')}
      </p>
      {waters.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          className="w-fit px-0"
          onClick={() => onChange(all ? [] : waters.map((water) => water.id))}
        >
          {all ? t('permits.form.waters.none') : t('permits.form.waters.all')}
        </Button>
      )}
      <ul className="flex max-h-80 flex-col overflow-y-auto">
        {waters.map((water) => (
          <li key={water.id}>
            <CheckboxField
              label={`${water.name} · ${water.region}`}
              checked={value.includes(water.id)}
              aria-invalid={error ? true : undefined}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, water.id]
                    : value.filter((id) => id !== water.id),
                )
              }
            />
          </li>
        ))}
      </ul>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  );
}
