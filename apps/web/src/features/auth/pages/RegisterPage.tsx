import { type RegisterInput, registerSchema } from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isLocale } from '../../../shared/i18n/i18n';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { CheckboxField, TextField } from '../../../shared/ui/form-field';
import { useRegister } from '../api/useAuth';
import { AuthCard } from '../components/AuthCard';

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const registration = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  if (registration.isSuccess) {
    return (
      <AuthCard title={t('auth.register.title')}>
        <Alert variant="success" role="status">
          <MailCheck aria-hidden />
          <AlertTitle>{t('auth.register.sentTitle')}</AlertTitle>
          <AlertDescription className="text-body">
            {t('auth.register.sent', { email: registration.variables.email })}
          </AlertDescription>
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.register.title')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) =>
          void handleSubmit(({ anglerCardNo, ...values }) =>
            registration.mutate({
              ...values,
              // An empty optional field is not sent.
              ...(anglerCardNo && { anglerCardNo }),
              // The emails come in the language the user registered in.
              ...(isLocale(i18n.resolvedLanguage) && { locale: i18n.resolvedLanguage }),
            }),
          )(event)
        }
      >
        <TextField
          label={t('auth.fields.email.label')}
          type="email"
          autoComplete="email"
          error={errors.email && t('auth.fields.email.error')}
          {...register('email')}
        />
        <TextField
          label={t('auth.fields.password.label')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.fields.password.hint')}
          error={errors.password && t('auth.fields.password.error')}
          {...register('password')}
        />
        <TextField
          label={t('auth.fields.firstName.label')}
          autoComplete="given-name"
          error={errors.firstName && t('auth.fields.firstName.error')}
          {...register('firstName')}
        />
        <TextField
          label={t('auth.fields.lastName.label')}
          autoComplete="family-name"
          error={errors.lastName && t('auth.fields.lastName.error')}
          {...register('lastName')}
        />
        <TextField
          label={t('auth.fields.birthDate.label')}
          type="date"
          autoComplete="bday"
          hint={t('auth.fields.birthDate.hint')}
          error={errors.birthDate && t('auth.fields.birthDate.error')}
          {...register('birthDate')}
        />
        <TextField
          label={t('auth.fields.anglerCardNo.label')}
          error={errors.anglerCardNo && t('auth.fields.anglerCardNo.error')}
          {...register('anglerCardNo')}
        />
        <CheckboxField
          label={
            <Trans
              i18nKey="auth.fields.acceptTerms.label"
              components={{ 1: <Link to="/privacy" className="text-primary underline" /> }}
            />
          }
          error={errors.acceptTerms && t('auth.fields.acceptTerms.error')}
          {...register('acceptTerms')}
        />
        {registration.isError && <ApiErrorAlert error={registration.error} />}
        <Button type="submit" disabled={registration.isPending}>
          {t('auth.register.submit')}
        </Button>
      </form>
      <p className="text-body">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="text-primary underline">
          {t('auth.register.login')}
        </Link>
      </p>
    </AuthCard>
  );
}
