import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

/** Fallback for an error thrown while rendering a route; replaces React Router's English default. */
export function RouteErrorPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 p-4 py-8">
      <h1 className="text-h1">{t('common.routeError.title')}</h1>
      <p className="text-muted-foreground">{t('errors.UNKNOWN_ERROR')}</p>
      <Button onClick={() => window.location.reload()}>{t('common.routeError.reload')}</Button>
    </main>
  );
}
