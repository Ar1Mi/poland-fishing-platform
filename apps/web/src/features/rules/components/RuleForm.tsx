import { type RuleFormOutput, type RuleFormValues, ruleFormSchema } from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { FieldError, TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import type { OrgWater } from '../../permits/api/usePermitTypes';
import { type OrgRule, type Species, useCreateRule, useUpdateRule } from '../api/useRules';
import { speciesName } from '../lib/format-rule';

const text = (value: number | string | null) => (value === null ? '' : String(value));

/**
 * New rule of the organization or one of its waters, or new parameters of `rule`. Species and
 * level of a stored rule do not change (docs/05-api.md): they are shown, not offered.
 * An empty field is «no restriction».
 */
export function RuleForm({
  orgId,
  species,
  waters,
  rule,
  onSaved,
  onCancel,
}: {
  orgId: string;
  species: Species[];
  waters: OrgWater[];
  rule?: OrgRule;
  onSaved: (saved: OrgRule) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const formErrorId = useId();
  const create = useCreateRule(orgId);
  const update = useUpdateRule(orgId);
  const mutation = rule ? update : create;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RuleFormValues, unknown, RuleFormOutput>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      speciesId: rule?.speciesId ?? '',
      fishingWaterId: rule?.water?.id ?? '',
      minLengthCm: text(rule?.minLengthCm ?? null),
      closedFrom: text(rule?.closedFrom ?? null),
      closedTo: text(rule?.closedTo ?? null),
      dailyLimitCount: text(rule?.dailyLimitCount ?? null),
      dailyLimitWeightG: text(rule?.dailyLimitWeightG ?? null),
    },
  });
  // «Restricts nothing» belongs to no field (an issue at the root of the schema).
  const nothing = (errors as Record<string, { message?: string } | undefined>)[''];

  const onSubmit = ({ speciesId, fishingWaterId, ...parameters }: RuleFormOutput) => {
    if (rule) {
      update.mutate({ id: rule.id, ...parameters }, { onSuccess: onSaved });
    } else {
      create.mutate({ speciesId, fishingWaterId, ...parameters }, { onSuccess: onSaved });
    }
  };

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>
          {rule ? t('rules.form.titleEdit') : t('rules.form.titleNew')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          aria-describedby={nothing ? formErrorId : undefined}
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <SelectField
            label={t('rules.form.species.label')}
            disabled={Boolean(rule)}
            aria-invalid={errors.speciesId ? true : undefined}
            aria-describedby={errors.speciesId ? `${titleId}-species` : undefined}
            {...register('speciesId')}
          >
            <option value="">{t('rules.form.species.placeholder')}</option>
            {species.map((item) => (
              <option key={item.id} value={item.id}>
                {speciesName(item, i18n.resolvedLanguage)}
              </option>
            ))}
          </SelectField>
          {errors.speciesId && (
            <FieldError id={`${titleId}-species`}>{t('rules.form.species.error')}</FieldError>
          )}
          <SelectField
            label={t('rules.form.scope.label')}
            disabled={Boolean(rule)}
            {...register('fishingWaterId')}
          >
            <option value="">{t('rules.form.scope.organization')}</option>
            {waters.map((water) => (
              <option key={water.id} value={water.id}>
                {water.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('rules.form.minLength.label')}
            hint={t('rules.form.emptyHint')}
            inputMode="numeric"
            className="[&_input]:font-mono"
            error={errors.minLengthCm && t('rules.form.minLength.error')}
            {...register('minLengthCm')}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body font-semibold">{t('rules.form.closed.legend')}</legend>
            <p className="text-small text-muted-foreground">{t('rules.form.closed.hint')}</p>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={t('rules.form.closed.from')}
                placeholder="MM-DD"
                className="[&_input]:font-mono"
                error={errors.closedFrom && t('rules.form.closed.error')}
                {...register('closedFrom')}
              />
              <TextField
                label={t('rules.form.closed.to')}
                placeholder="MM-DD"
                className="[&_input]:font-mono"
                error={errors.closedTo && t('rules.form.closed.error')}
                {...register('closedTo')}
              />
            </div>
          </fieldset>
          <TextField
            label={t('rules.form.dailyCount.label')}
            hint={t('rules.form.limitHint')}
            inputMode="numeric"
            className="[&_input]:font-mono"
            error={errors.dailyLimitCount && t('rules.form.dailyCount.error')}
            {...register('dailyLimitCount')}
          />
          <TextField
            label={t('rules.form.dailyWeight.label')}
            hint={t('rules.form.limitHint')}
            inputMode="numeric"
            className="[&_input]:font-mono"
            error={errors.dailyLimitWeightG && t('rules.form.dailyWeight.error')}
            {...register('dailyLimitWeightG')}
          />
          {/* Belongs to no field, so it is announced on submit instead of on focus. */}
          <div role="alert">
            {nothing && <FieldError id={formErrorId}>{t('rules.form.nothing')}</FieldError>}
          </div>
          {mutation.isError && <ApiErrorAlert error={mutation.error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {rule ? t('rules.form.submitEdit') : t('rules.form.submitNew')}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('rules.form.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
