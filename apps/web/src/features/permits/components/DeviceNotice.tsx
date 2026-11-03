import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '../../../shared/ui/alert';

/** Permits shown from the device, without the server: as they were at the last refresh. */
export function DeviceNotice() {
  const { t } = useTranslation();
  return (
    <Alert variant="warning">
      <WifiOff aria-hidden />
      <AlertDescription className="text-body">{t('permits.device.notice')}</AlertDescription>
    </Alert>
  );
}
