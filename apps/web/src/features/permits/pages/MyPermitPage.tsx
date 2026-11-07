import { CircleX, Download, LoaderCircle, Plus, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { formatDate, formatPrice } from '../../../shared/lib/format';
import { saveFile } from '../../../shared/lib/save-file';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent } from '../../../shared/ui/card';
import { useDevicePermits } from '../api/useDevicePermits';
import { useMyPermit, useMyPermitPdf } from '../api/useMyPermits';
import { DeviceNotice } from '../components/DeviceNotice';
import { PermitTicket } from '../components/PermitTicket';
import { PermitTypeTerms } from '../components/PermitTypeTerms';

/** `/me/permits/:id` — the permit with its QR code and the PDF to print. */
export function MyPermitPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const { id = '' } = useParams();
  const permit = useMyPermit(id);
  const pdf = useMyPermitPdf();
  const device = useDevicePermits();
  // Without the server the permit kept on the device shows its QR (ADR-0009).
  const onDevice = permit.data ? undefined : device.permits?.find((item) => item.id === id);
  const data = permit.data ?? onDevice;

  return (
    <>
      <h1 className="text-h1">{t('permits.detail.title')}</h1>
      {onDevice && <DeviceNotice />}
      {device.offline && !data && device.permits !== undefined && (
        <Alert variant="warning">
          <WifiOff aria-hidden />
          <AlertDescription className="text-body">{t('permits.device.missing')}</AlertDescription>
        </Alert>
      )}
      {permit.isPending && !device.offline && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.detail.loading')}
        </Badge>
      )}
      {permit.isError && !onDevice && <ApiErrorAlert error={permit.error} />}
      {data && (
        <>
          <PermitTicket permit={data} />
          {data.status === 'REVOKED' && (
            // FR-10: the organization revoked it; a refund, if any, is noted in the reason.
            <Alert variant="destructive">
              <CircleX aria-hidden />
              <AlertTitle>
                {data.revokedAt
                  ? t('permits.detail.revokedOn', { date: formatDate(data.revokedAt, locale) })
                  : t('permits.detail.revoked')}
              </AlertTitle>
              {data.revokeReason && (
                <AlertDescription className="text-body whitespace-pre-line">
                  {t('permits.detail.revokeReason', { reason: data.revokeReason })}
                </AlertDescription>
              )}
              <AlertDescription className="text-body">
                {t('permits.detail.revokedHint', { organization: data.organization.name })}
              </AlertDescription>
            </Alert>
          )}
          {data.status === 'ACTIVE' && (
            <Button asChild variant="accent" className="w-fit">
              <Link to="/catch/new">
                <Plus aria-hidden />
                {t('catches.links.add')}
              </Link>
            </Button>
          )}
          <Card>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="caption text-muted-foreground">
                  {t('permits.detail.organization')}
                </dt>
                <dd className="text-body">{data.organization.name}</dd>
                <dt className="caption text-muted-foreground">{t('permits.detail.terms')}</dt>
                <dd className="text-body">
                  <PermitTypeTerms type={data.permitType} />
                </dd>
                <dt className="caption text-muted-foreground">{t('permits.buy.price')}</dt>
                <dd className="font-mono text-body">{formatPrice(data.pricePaidGrosze, locale)}</dd>
              </dl>
            </CardContent>
          </Card>
          {data.qrToken !== null && !onDevice && (
            <Button
              variant="secondary"
              className="w-fit"
              disabled={pdf.isPending}
              onClick={() => {
                const { id: permitId, number } = data;
                pdf.mutate(permitId, { onSuccess: (blob) => saveFile(blob, `${number}.pdf`) });
              }}
            >
              <Download aria-hidden />
              {t('permits.detail.downloadPdf')}
            </Button>
          )}
          {pdf.isError && <ApiErrorAlert error={pdf.error} />}
        </>
      )}
      <Link
        to="/me/permits"
        className="flex min-h-11 w-fit items-center font-semibold text-primary"
      >
        {t('permits.detail.backToList')}
      </Link>
    </>
  );
}
