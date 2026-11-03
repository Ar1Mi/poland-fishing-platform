import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';

/** A page that needs the server, opened without network: where the angler can go instead. */
export function OfflineUnavailable() {
  const { t } = useTranslation();
  return (
    <>
      <Alert variant="warning">
        <WifiOff aria-hidden />
        <AlertTitle>{t('auth.offline.title')}</AlertTitle>
        <AlertDescription className="text-body">{t('auth.offline.text')}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-x-6">
        <Link to="/catch/new" className="flex min-h-11 items-center font-semibold text-primary">
          {t('auth.offline.toCatch')}
        </Link>
        <Link to="/me/permits" className="flex min-h-11 items-center font-semibold text-primary">
          {t('auth.offline.toPermits')}
        </Link>
      </div>
    </>
  );
}
