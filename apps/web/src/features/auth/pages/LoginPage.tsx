import { type LoginInput, loginSchema } from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/form-field';
import { useLogin } from '../api/useAuth';
import { AuthCard } from '../components/AuthCard';
import type { RedirectState } from '../components/GuestOnly';

export function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const notice = (useLocation().state as RedirectState | null)?.notice;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  return (
    <AuthCard title={t('auth.login.title')}>
      {notice === 'passwordReset' && !login.isError && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription className="text-body">{t('auth.login.passwordReset')}</AlertDescription>
        </Alert>
      )}
      {/* GuestOnly redirects once the session starts. */}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit((values) => login.mutate(values))(event)}
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
          autoComplete="current-password"
          error={errors.password && t('auth.fields.password.required')}
          {...register('password')}
        />
        {login.isError && <ApiErrorAlert error={login.error} />}
        <Button type="submit" disabled={login.isPending}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <Link to="/reset-password" className="text-body text-primary underline">
        {t('auth.login.forgot')}
      </Link>
      <p className="text-body">
        {t('auth.login.noAccount')}{' '}
        <Link to="/register" className="text-primary underline">
          {t('auth.login.register')}
        </Link>
      </p>
    </AuthCard>
  );
}
