import { Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../shared/lib/format';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardTitle } from '../../../shared/ui/card';
import type { MyPermit } from '../api/usePurchase';
import { verifyUrl } from '../lib/verify-url';
import { PermitStatusBadge } from './PermitStatusBadge';
import { QrFullscreen } from './QrFullscreen';

/**
 * `PermitTicket` of the design system: dark header with the status, the QR code (while the permit
 * is scheduled or active), the number as text and the validity.
 */
export function PermitTicket({ permit }: { permit: MyPermit }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const [fullscreen, setFullscreen] = useState(false);
  const close = useCallback(() => setFullscreen(false), []);
  const qrValue = permit.qrToken === null ? null : verifyUrl(permit.qrToken);

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-primary-dark px-4 py-3 text-primary-foreground">
        <CardTitle>{permit.permitType.name}</CardTitle>
        <PermitStatusBadge status={permit.status} />
      </div>
      <CardContent className="items-center p-4">
        {qrValue && (
          <>
            <QRCodeSVG
              value={qrValue}
              size={224}
              level="M"
              marginSize={4}
              title={t('permits.qr.alt', { number: permit.number })}
            />
            <Button variant="primary" onClick={() => setFullscreen(true)}>
              <Maximize2 aria-hidden />
              {t('permits.qr.showFullscreen')}
            </Button>
          </>
        )}
        <p className="font-mono text-body font-semibold">{permit.number}</p>
        <p className="text-center text-body">
          {t('permits.validity', {
            from: formatDate(permit.validFrom, locale),
            to: formatDate(permit.validTo, locale),
          })}
        </p>
        {qrValue && fullscreen && (
          <QrFullscreen value={qrValue} number={permit.number} onClose={close} />
        )}
      </CardContent>
    </Card>
  );
}
