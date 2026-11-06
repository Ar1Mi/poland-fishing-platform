import {
  type CreateOrganizationInput,
  createOrganizationSchema,
  ORG_NAME_MAX_LENGTH,
  OrganizationKind,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import { useApplyOrganization } from '../api/useOrganizations';

/**
 * `/org/new` (FR-03, scenario Д): a representative applies to register the organization. They
 * become its admin at once, but the organization works only after the super admin activates it.
 */
export function OrgApplicationPage() {
  const { t } = useTranslation();
  const apply = useApplyOrganization();
  const done = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', nip: '', kind: '' as OrganizationKind, contactEmail: '' },
  });

  useEffect(() => {
    if (apply.isSuccess) done.current?.focus();
  }, [apply.isSuccess]);

  if (apply.isSuccess) {
    return (
      <>
        <h1 className="text-h1">{t('orgs.apply.title')}</h1>
        <div ref={done} tabIndex={-1}>
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertTitle>{t('orgs.apply.sentTitle', { name: apply.data.name })}</AlertTitle>
            <AlertDescription>{t('orgs.apply.sent')}</AlertDescription>
          </Alert>
        </div>
        <Link
          to="/org"
          className="flex min-h-11 w-fit items-center font-semibold text-primary underline"
        >
          {t('orgs.apply.toMine')}
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-h1">{t('orgs.apply.title')}</h1>
      <p className="text-body">{t('orgs.apply.lead')}</p>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit((values) => apply.mutate(values))(event)}
      >
        <TextField
          label={t('orgs.apply.name')}
          maxLength={ORG_NAME_MAX_LENGTH}
          error={errors.name && t('orgs.apply.nameError')}
          {...register('name')}
        />
        <TextField
          label={t('orgs.apply.nip')}
          hint={t('orgs.apply.nipHint')}
          inputMode="numeric"
          autoComplete="off"
          error={errors.nip && t('orgs.apply.nipError')}
          {...register('nip')}
        />
        <div className="flex flex-col gap-1">
          <SelectField
            label={t('orgs.apply.kind')}
            aria-invalid={errors.kind ? true : undefined}
            {...register('kind')}
          >
            <option value="" disabled>
              {t('orgs.apply.kindPlaceholder')}
            </option>
            {Object.values(OrganizationKind).map((kind) => (
              <option key={kind} value={kind}>
                {t(`orgs.kind.${kind}`)}
              </option>
            ))}
          </SelectField>
          {errors.kind && (
            <p className="text-small text-destructive">{t('orgs.apply.kindError')}</p>
          )}
        </div>
        <TextField
          label={t('orgs.apply.contactEmail')}
          type="email"
          autoComplete="email"
          error={errors.contactEmail && t('orgs.apply.contactEmailError')}
          {...register('contactEmail')}
        />
        {apply.isError && <ApiErrorAlert error={apply.error} />}
        <Button type="submit" className="w-fit" disabled={apply.isPending}>
          {t('orgs.apply.submit')}
        </Button>
      </form>
    </>
  );
}
