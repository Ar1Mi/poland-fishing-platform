import { Download, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { formatPrice } from '../../../shared/lib/format';
import { saveFile } from '../../../shared/lib/save-file';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent } from '../../../shared/ui/card';
import { useMyPermit, useMyPermitPdf } from '../api/useMyPermits';
import { PermitTicket } from '../components/PermitTicket';
import { PermitTypeTerms } from '../components/PermitTypeTerms';

/** `/me/permits/:id` — the permit with its QR code and the PDF to print. */
export function MyPermitPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const { id = '' } = useParams();
  const permit = useMyPermit(id);
  const pdf = useMyPermitPdf();

  return (
    <>
      <h1 className="text-h1">{t('permits.detail.title')}</h1>
      {permit.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.detail.loading')}
        </Badge>
      )}
      {permit.isError && <ApiErrorAlert error={permit.error} />}
      {permit.data && (
        <>
          <PermitTicket permit={permit.data} />
          <Card>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="caption text-muted-foreground">
                  {t('permits.detail.organization')}
                </dt>
                <dd className="text-body">{permit.data.organization.name}</dd>
                <dt className="caption text-muted-foreground">{t('permits.detail.terms')}</dt>
                <dd className="text-body">
                  <PermitTypeTerms type={permit.data.permitType} />
                </dd>
                <dt className="caption text-muted-foreground">{t('permits.buy.price')}</dt>
                <dd className="font-mono text-body">
                  {formatPrice(permit.data.pricePaidGrosze, locale)}
                </dd>
              </dl>
            </CardContent>
          </Card>
          {permit.data.qrToken !== null && (
            <Button
              variant="secondary"
              className="w-fit"
              disabled={pdf.isPending}
              onClick={() => {
                const { id: permitId, number } = permit.data;
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
