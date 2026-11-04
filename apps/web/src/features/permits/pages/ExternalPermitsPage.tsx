import { ChevronRight, LoaderCircle, Paperclip, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { useExternalPermits } from '../api/useExternalPermits';
import { PermitStatusBadge } from '../components/PermitStatusBadge';

/**
 * `/me/external-permits` — permits bought outside the platform (FR-26, scenario Г): catches on
 * them go to the same register, checked against the general rules.
 */
export function ExternalPermitsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const permits = useExternalPermits();

  return (
    <>
      <h1 className="text-h1">{t('permits.external.list.title')}</h1>
      <p className="text-body">{t('permits.external.list.lead')}</p>
      <Button asChild variant="accent" className="w-fit">
        <Link to="/me/external-permits/new">
          <Plus aria-hidden />
          {t('permits.external.list.add')}
        </Link>
      </Button>
      {permits.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.external.list.loading')}
        </Badge>
      )}
      {permits.isError && <ApiErrorAlert error={permits.error} />}
      {permits.data?.length === 0 && (
        <p className="text-body">{t('permits.external.list.empty')}</p>
      )}
      {permits.data && permits.data.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t('permits.external.list.title')}>
          {permits.data.map((permit) => (
            <li key={permit.id}>
              <Link
                to={`/me/external-permits/${permit.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-body font-semibold">{permit.issuerName}</span>
                  {permit.number && <span className="font-mono text-small">{permit.number}</span>}
                  <span className="text-small text-muted-foreground">
                    {permit.waters.map((water) => water.name).join(', ')}
                  </span>
                  <span className="text-small">
                    {t('permits.validity', {
                      from: formatDate(permit.validFrom, locale),
                      to: formatDate(permit.validTo, locale),
                    })}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <PermitStatusBadge status={permit.status} />
                    {permit.photoType && (
                      <Badge variant="neutral">
                        <Paperclip aria-hidden />
                        {t('permits.external.list.withPhoto')}
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/me/permits"
        className="flex min-h-11 w-fit items-center font-semibold text-primary"
      >
        {t('permits.external.list.toPermits')}
      </Link>
    </>
  );
}
