import { FlaskConical, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { formatPrice } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { type FakePaymentOutcome, useCompleteFakePayment } from '../api/usePurchase';
import { safeReturnPath } from '../lib/return-url';

/**
 * `/payment/fake/:sessionId` — the payment page of FakePaymentProvider (development and E2E
 * with PAYMENTS_PROVIDER=fake), in place of the Przelewy24 one. Amount and title come from
 * the address and are only shown; the API pays the amount it stored.
 */
export function FakePaymentPage() {
  const { t, i18n } = useTranslation();
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const complete = useCompleteFakePayment(sessionId);
  const amount = Number(searchParams.get('amount'));
  const description = searchParams.get('description');
  const locale = i18n.resolvedLanguage ?? 'pl';

  const finish = (outcome: FakePaymentOutcome) => {
    complete.mutate(outcome, {
      // Back like from a gateway: to the return page, which asks the API what happened.
      onSuccess: () =>
        void navigate(safeReturnPath(searchParams.get('returnUrl'), window.location.origin), {
          replace: true,
        }),
    });
  };

  const busy = complete.isPending || complete.isSuccess;
  return (
    <>
      <h1 className="text-h1">{t('permits.payment.fake.title')}</h1>
      <Alert variant="warning">
        <FlaskConical aria-hidden />
        <AlertDescription className="text-body">
          {t('permits.payment.fake.notice')}
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>{description}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="caption text-muted-foreground">{t('permits.payment.fake.amount')}</dt>
            <dd className="font-mono text-body font-semibold">
              {Number.isSafeInteger(amount) ? formatPrice(amount, locale) : '—'}
            </dd>
          </dl>
          {complete.isError && <ApiErrorAlert error={complete.error} />}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="accent" disabled={busy} onClick={() => finish('PAID')}>
              {complete.isPending && complete.variables === 'PAID' && (
                <LoaderCircle aria-hidden className="animate-spin" />
              )}
              {t('permits.payment.fake.pay')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => finish('REJECTED')}>
              {t('permits.payment.fake.reject')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
