import {
  type ForgotPasswordInput,
  type ResetPasswordInput,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/form-field';
import { useForgotPassword, useResetPassword } from '../api/useAuth';
import { AuthCard } from '../components/AuthCard';
import type { RedirectState } from '../components/GuestOnly';

/** `/reset-password` asks for the email; `/reset-password?token=…` (from the email) sets the password. */
export function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token');
  return token ? <NewPasswordForm token={token} /> : <ForgotPasswordForm />;
}

function ForgotPasswordForm() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  return (
    <AuthCard title={t('auth.forgotPassword.title')}>
      {forgot.isSuccess ? (
        <Alert variant="success" role="status">
          <MailCheck aria-hidden />
          <AlertDescription className="text-body">{t('auth.forgotPassword.sent')}</AlertDescription>
        </Alert>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleSubmit((values) => forgot.mutate(values))(event)}
        >
          <p className="text-body text-muted-foreground">{t('auth.forgotPassword.lead')}</p>
          <TextField
            label={t('auth.fields.email.label')}
            type="email"
            autoComplete="email"
            error={errors.email && t('auth.fields.email.error')}
            {...register('email')}
          />
          {forgot.isError && <ApiErrorAlert error={forgot.error} />}
          <Button type="submit" disabled={forgot.isPending}>
            {t('auth.forgotPassword.submit')}
          </Button>
        </form>
      )}
      <Link to="/login" className="text-body text-primary underline">
        {t('auth.forgotPassword.back')}
      </Link>
    </AuthCard>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });
  const linkUnusable =
    reset.error instanceof ApiError &&
    (reset.error.code === 'INVALID_TOKEN' || reset.error.code === 'TOKEN_EXPIRED');

  return (
    <AuthCard title={t('auth.resetPassword.title')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) =>
          void handleSubmit((values) =>
            reset.mutate(values, {
              onSuccess: () => {
                const state: RedirectState = { notice: 'passwordReset' };
                void navigate('/login', { replace: true, state });
              },
            }),
          )(event)
        }
      >
        <TextField
          label={t('auth.fields.newPassword.label')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.fields.password.hint')}
          error={errors.password && t('auth.fields.password.error')}
          {...register('password')}
        />
        {reset.isError && <ApiErrorAlert error={reset.error} />}
        <Button type="submit" disabled={reset.isPending}>
          {t('auth.resetPassword.submit')}
        </Button>
      </form>
      {linkUnusable && (
        <Link to="/reset-password" className="text-body text-primary underline">
          {t('auth.resetPassword.requestNew')}
        </Link>
      )}
    </AuthCard>
  );
}
