import type { EffectivePermitStatus } from '@lowisko/shared';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import type { MyPermit } from '../api/usePurchase';
import { useMyPermits } from '../api/useMyPermits';
import { PermitStatusBadge } from '../components/PermitStatusBadge';

/** Permits the angler can still use or is paying for; the rest is history. */
const CURRENT: ReadonlySet<EffectivePermitStatus> = new Set([
  'ACTIVE',
  'SCHEDULED',
  'PENDING_PAYMENT',
]);

/** `/me/permits` — the angler's permits, current ones first; each opens its QR. */
export function MyPermitsPage() {
  const { t } = useTranslation();
  const permits = useMyPermits();
  const current = permits.data?.filter((permit) => CURRENT.has(permit.status)) ?? [];
  const past = permits.data?.filter((permit) => !CURRENT.has(permit.status)) ?? [];

  return (
    <>
      <h1 className="text-h1">{t('permits.mine.title')}</h1>
      {permits.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.mine.loading')}
        </Badge>
      )}
      {permits.isError && <ApiErrorAlert error={permits.error} />}
      {permits.data?.length === 0 && (
        <>
          <p className="text-body">{t('permits.mine.empty')}</p>
          <Link to="/" className="flex min-h-11 w-fit items-center font-semibold text-primary">
            {t('permits.mine.toCatalog')}
          </Link>
        </>
      )}
      {current.length > 0 && <PermitList title={t('permits.mine.current')} permits={current} />}
      {past.length > 0 && <PermitList title={t('permits.mine.past')} permits={past} />}
    </>
  );
}

function PermitList({ title, permits }: { title: string; permits: MyPermit[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-h2">{title}</h2>
      <ul className="flex flex-col gap-3">
        {permits.map((permit) => (
          <li key={permit.id}>
            <Link
              to={`/me/permits/${permit.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-body font-semibold">{permit.permitType.name}</span>
                <span className="text-small text-muted-foreground">{permit.organization.name}</span>
                <span className="font-mono text-small">{permit.number}</span>
                <span className="text-small">
                  {t('permits.validity', {
                    from: formatDate(permit.validFrom, locale),
                    to: formatDate(permit.validTo, locale),
                  })}
                </span>
                <PermitStatusBadge status={permit.status} />
              </div>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
