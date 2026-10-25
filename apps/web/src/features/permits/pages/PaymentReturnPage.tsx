import { CircleCheck, CircleX, Clock, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { formatDate, formatPrice } from '../../../shared/lib/format';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { type MyPermit, PAYMENT_POLL_WINDOW_MS, useMyPermitPolling } from '../api/usePurchase';
import { PermitTypeTerms } from '../components/PermitTypeTerms';

/**
 * `/payment/return?permitId=` — where the gateway sends the buyer back (scenario A). Coming
 * back proves nothing: the page asks the API until the payment notification has decided.
 */
export function PaymentReturnPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const permitId = searchParams.get('permitId');
  return (
    <>
      <h1 className="text-h1">{t('permits.payment.return.title')}</h1>
      {permitId ? (
        <PaymentOutcome permitId={permitId} />
      ) : (
        <>
          <Alert variant="warning" role="alert">
            <CircleX aria-hidden />
            <AlertDescription className="text-body">
              {t('permits.payment.return.missing')}
            </AlertDescription>
          </Alert>
          <CatalogLink />
        </>
      )}
    </>
  );
}

function PaymentOutcome({ permitId }: { permitId: string }) {
  const { t } = useTranslation();
  // Start of the current round of polling; «Sprawdź ponownie» starts a new one.
  const [pollingSince, setPollingSince] = useState(() => Date.now());
  const permit = useMyPermitPolling(permitId, pollingSince);
  // Polling stops after the first answer that came at least PAYMENT_POLL_WINDOW_MS later.
  const lastAnswerAt = Math.max(permit.dataUpdatedAt, permit.errorUpdatedAt);

  if (permit.isPending) {
    return <Waiting text={t('permits.payment.return.loading')} />;
  }
  if (permit.isError && !permit.data) {
    return <ApiErrorAlert error={permit.error} />;
  }
  const { data } = permit;
  switch (data.status) {
    case 'PENDING_PAYMENT':
      if (lastAnswerAt - pollingSince < PAYMENT_POLL_WINDOW_MS) {
        return <Waiting text={t('permits.payment.return.waiting')} />;
      }
      return (
        <>
          <Alert variant="warning" role="alert">
            <Clock aria-hidden />
            <AlertDescription className="text-body">
              {t('permits.payment.return.timeout')}
            </AlertDescription>
          </Alert>
          <Button
            variant="secondary"
            className="w-fit"
            onClick={() => {
              setPollingSince(Date.now());
              void permit.refetch();
            }}
          >
            <RefreshCw aria-hidden />
            {t('permits.payment.return.checkAgain')}
          </Button>
        </>
      );
    case 'CANCELLED':
      return (
        <>
          <Alert variant="destructive" role="alert">
            <CircleX aria-hidden />
            <AlertTitle>{t('permits.payment.return.cancelledTitle')}</AlertTitle>
            <AlertDescription className="text-body">
              {t('permits.payment.return.cancelled')}
            </AlertDescription>
          </Alert>
          <CatalogLink />
        </>
      );
    case 'REVOKED':
      return (
        <>
          <Alert variant="destructive" role="alert">
            <CircleX aria-hidden />
            <AlertTitle>{t('permits.payment.return.revokedTitle')}</AlertTitle>
          </Alert>
          <CatalogLink />
        </>
      );
    default:
      return <PaidPermit permit={data} />;
  }
}

/** SCHEDULED, ACTIVE or EXPIRED: the payment went through. QR and the list come with T-15. */
function PaidPermit({ permit }: { permit: MyPermit }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  return (
    <>
      <Alert variant="success" role="status">
        <CircleCheck aria-hidden />
        <AlertTitle>
          {permit.pricePaidGrosze === 0
            ? t('permits.payment.return.freeTitle')
            : t('permits.payment.return.paidTitle')}
        </AlertTitle>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>{permit.permitType.name}</CardTitle>
          <p className="text-small text-muted-foreground">
            <PermitTypeTerms type={permit.permitType} />
          </p>
          <Badge variant={permit.status === 'EXPIRED' ? 'neutral' : 'success'}>
            <CircleCheck aria-hidden />
            {t(`permits.status.${permit.status}`)}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="caption text-muted-foreground">{t('permits.payment.return.number')}</dt>
            <dd className="font-mono text-body font-semibold">{permit.number}</dd>
            <dt className="caption text-muted-foreground">
              {t('permits.payment.return.organization')}
            </dt>
            <dd className="text-body">{permit.organization.name}</dd>
            <dt className="caption text-muted-foreground">{t('permits.buy.price')}</dt>
            <dd className="font-mono text-body">{formatPrice(permit.pricePaidGrosze, locale)}</dd>
          </dl>
          <p className="text-body">
            {t('permits.validity', {
              from: formatDate(permit.validFrom, locale),
              to: formatDate(permit.validTo, locale),
            })}
          </p>
        </CardContent>
      </Card>
      <CatalogLink />
    </>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <Badge variant="neutral" role="status">
      <LoaderCircle aria-hidden className="animate-spin" />
      {text}
    </Badge>
  );
}

function CatalogLink() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="flex min-h-11 w-fit items-center font-semibold text-primary">
      {t('permits.payment.return.backToCatalog')}
    </Link>
  );
}
