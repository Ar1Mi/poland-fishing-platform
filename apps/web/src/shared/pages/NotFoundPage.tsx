import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <p className="text-data text-muted-foreground">404</p>
      <h1 className="text-h1">{t('common.notFound.title')}</h1>
      <p className="text-muted-foreground">{t('common.notFound.description')}</p>
      <Button asChild>
        <Link to="/">{t('common.notFound.home')}</Link>
      </Button>
    </div>
  );
}
