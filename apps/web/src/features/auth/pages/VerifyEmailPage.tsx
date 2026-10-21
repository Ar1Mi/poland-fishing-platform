import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { useVerifyEmail } from '../api/useAuth';
import { AuthCard } from '../components/AuthCard';

/** Opened from the confirmation email: `/verify-email?token=…`. */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const token = useSearchParams()[0].get('token');
  const verify = useVerifyEmail();
  const sent = useRef(false);

  useEffect(() => {
    // Once only: a link is single-use, and StrictMode runs effects twice in development.
    if (token && !sent.current) {
      sent.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  return (
    <AuthCard title={t('auth.verifyEmail.title')}>
      {!token && <ApiErrorAlert error={new ApiError('INVALID_TOKEN', 'Missing token')} />}
      {verify.isPending && (
        <p className="flex items-center gap-2 text-body" role="status">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          {t('auth.verifyEmail.checking')}
        </p>
      )}
      {verify.isError && <ApiErrorAlert error={verify.error} />}
      {verify.isSuccess && (
        <>
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription className="text-body">
              {t('auth.verifyEmail.success')}
            </AlertDescription>
          </Alert>
          <Button asChild>
            <Link to="/login">{t('auth.verifyEmail.login')}</Link>
          </Button>
        </>
      )}
    </AuthCard>
  );
}
