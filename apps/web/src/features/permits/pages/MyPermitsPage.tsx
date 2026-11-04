import type { EffectivePermitStatus } from '@lowisko/shared';
import { ChevronRight, FileText, LoaderCircle, NotebookPen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import type { MyPermit } from '../api/usePurchase';
import { useDevicePermits } from '../api/useDevicePermits';
import { useMyPermits } from '../api/useMyPermits';
import { DeviceNotice } from '../components/DeviceNotice';
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
  const device = useDevicePermits();
  // Without the server the permits kept on the device stand in (ADR-0009).
  const fromDevice = !permits.data && device.permits !== undefined;
  const data = permits.data ?? device.permits;
  const current = data?.filter((permit) => CURRENT.has(permit.status)) ?? [];
  const past = data?.filter((permit) => !CURRENT.has(permit.status)) ?? [];

  return (
    <>
      <h1 className="text-h1">{t('permits.mine.title')}</h1>
      {fromDevice && <DeviceNotice />}
      {permits.isPending && !fromDevice && !device.offline && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.mine.loading')}
        </Badge>
      )}
      {permits.isError && !fromDevice && <ApiErrorAlert error={permits.error} />}
      {/* The register lives with the permits it is kept on (FR-11). */}
      {data && data.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {data.some((permit) => permit.status === 'ACTIVE') && (
            <Button asChild variant="accent">
              <Link to="/catch/new">
                <Plus aria-hidden />
                {t('catches.links.add')}
              </Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link to="/me/catches">
              <NotebookPen aria-hidden />
              {t('catches.links.register')}
            </Link>
          </Button>
        </div>
      )}
      {data?.length === 0 && (
        <>
          <p className="text-body">{t('permits.mine.empty')}</p>
          <Link to="/" className="flex min-h-11 w-fit items-center font-semibold text-primary">
            {t('permits.mine.toCatalog')}
          </Link>
        </>
      )}
      {current.length > 0 && <PermitList title={t('permits.mine.current')} permits={current} />}
      {past.length > 0 && <PermitList title={t('permits.mine.past')} permits={past} />}
      {/* Bought outside the platform (FR-26): typed in online, so not in an offline session. */}
      {!device.offline && (
        <section aria-labelledby="external-permits-title" className="flex flex-col gap-2">
          <h2 id="external-permits-title" className="text-h2">
            {t('permits.mine.externalTitle')}
          </h2>
          <p className="text-body">{t('permits.mine.externalLead')}</p>
          <Button asChild variant="secondary" className="w-fit">
            <Link to="/me/external-permits">
              <FileText aria-hidden />
              {t('permits.mine.externalLink')}
            </Link>
          </Button>
        </section>
      )}
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
