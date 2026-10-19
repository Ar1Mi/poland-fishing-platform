import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useHealth } from '../api/useHealth';

/** Placeholder until the catalogue map (T-09); shows that the typed API client works. */
export function HomePage() {
  const { t } = useTranslation();
  const health = useHealth();
  return (
    <>
      <h1 className="text-h1">{t('home.page.title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('home.page.apiStatus')}</CardTitle>
          <CardDescription>{t('home.page.lead')}</CardDescription>
        </CardHeader>
        <CardContent>
          {health.isPending && (
            <Badge variant="neutral">
              <LoaderCircle aria-hidden className="animate-spin" />
              {t('home.page.apiChecking')}
            </Badge>
          )}
          {health.isSuccess && (
            <Badge variant="success">
              <CircleCheck aria-hidden />
              {t('home.page.apiOk')}
            </Badge>
          )}
          {health.isError && <ApiErrorAlert error={health.error} />}
        </CardContent>
      </Card>
    </>
  );
}
