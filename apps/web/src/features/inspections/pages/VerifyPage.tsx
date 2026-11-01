import { LoaderCircle, LogIn } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useSessionStatus } from '../../auth/api/useAuth';
import type { RedirectState } from '../../auth/components/GuestOnly';
import { CatchSummary } from '../../catches/components/CatchSummary';
import { PermitStatusBadge } from '../../permits/components/PermitStatusBadge';
import { useSpecies } from '../../rules/api/useRules';
import { type InspectionView, type VerifiedPermit, useVerification } from '../api/useInspections';
import { InspectionForm } from '../components/InspectionForm';
import { VerdictBanner } from '../components/VerdictBanner';

/**
 * `/verify/:token` — what the phone camera opens from the QR code of a permit (scenario В):
 * the verdict and the public data for anyone; for an inspector or admin of the issuing
 * organization also the holder, today's catches and the protocol form.
 */
export function VerifyPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const verification = useVerification(token);
  const session = useSessionStatus();

  if (verification.isError) {
    return <ApiErrorAlert error={verification.error} />;
  }
  if (!verification.data) {
    return (
      <Badge variant="neutral" role="status">
        <LoaderCircle aria-hidden className="animate-spin" />
        {t('inspections.verify.loading')}
      </Badge>
    );
  }
  const { valid, permit, inspection } = verification.data;
  return (
    <>
      <VerdictBanner
        valid={valid}
        title={t(valid ? 'inspections.verify.valid' : 'inspections.verify.invalid')}
      >
        {permit ? <Reason permit={permit} /> : t('inspections.verify.notGenuine')}
      </VerdictBanner>
      {permit && <PermitCard permit={permit} />}
      {inspection && permit && <InspectorView permit={permit} inspection={inspection} />}
      {permit && !inspection && (session === 'guest' ? <InspectorLogin /> : <PublicOnly />)}
    </>
  );
}

/** Why an invalid permit is invalid; nothing more for a valid one. */
function Reason({ permit }: { permit: VerifiedPermit }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  if (permit.status === 'ACTIVE') {
    return null;
  }
  return t(`inspections.verify.reason.${permit.status}`, {
    from: formatDate(permit.validFrom, locale),
    to: formatDate(permit.validTo, locale),
  });
}

function PermitCard({ permit }: { permit: VerifiedPermit }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{permit.permitType.name}</CardTitle>
        <PermitStatusBadge status={permit.status} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="caption text-muted-foreground">{t('inspections.permit.organization')}</dt>
          <dd className="text-body">{permit.organization.name}</dd>
          <dt className="caption text-muted-foreground">{t('inspections.permit.validity')}</dt>
          <dd className="text-body">
            {t('permits.validity', {
              from: formatDate(permit.validFrom, locale),
              to: formatDate(permit.validTo, locale),
            })}
          </dd>
          <dt className="caption text-muted-foreground">{t('inspections.permit.holder')}</dt>
          <dd className="text-body">{permit.holderInitials}</dd>
          <dt className="caption text-muted-foreground">{t('inspections.permit.waters')}</dt>
          <dd>
            <ul className="text-body">
              {permit.waters.map((water) => (
                <li key={water.id}>{water.name}</li>
              ))}
            </ul>
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function InspectorView({
  permit,
  inspection,
}: {
  permit: VerifiedPermit;
  inspection: InspectionView;
}) {
  const { t } = useTranslation();
  const catchesTitleId = useId();
  const species = useSpecies();
  const { holder, catchesToday } = inspection;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('inspections.holder.title')}</CardTitle>
          <p className="text-small text-muted-foreground">{t('inspections.holder.compare')}</p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="caption text-muted-foreground">{t('inspections.holder.name')}</dt>
            <dd className="text-body font-semibold">
              {holder.firstName} {holder.lastName}
            </dd>
            <dt className="caption text-muted-foreground">{t('inspections.holder.birthYear')}</dt>
            <dd className="font-mono text-body">{holder.birthYear}</dd>
            <dt className="caption text-muted-foreground">{t('inspections.holder.number')}</dt>
            <dd className="font-mono text-body">{inspection.number}</dd>
          </dl>
        </CardContent>
      </Card>
      <section aria-labelledby={catchesTitleId} className="flex flex-col gap-3">
        <h2 id={catchesTitleId} className="text-h2">
          {t('inspections.catches.title')}
        </h2>
        {species.isError && <ApiErrorAlert error={species.error} />}
        {catchesToday.length === 0 ? (
          <p className="text-body">{t('inspections.catches.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {catchesToday.map((fish) => (
              <li
                key={fish.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <CatchSummary fish={fish} species={species.data ?? []} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-small text-muted-foreground">{t('inspections.catches.onlineOnly')}</p>
      </section>
      <InspectionForm orgId={permit.organization.id} permitId={inspection.permitId} />
    </>
  );
}

function InspectorLogin() {
  const { t } = useTranslation();
  const location = useLocation();
  const state: RedirectState = { from: location.pathname };
  return (
    <p className="text-body">
      {t('inspections.verify.inspectorHint')}{' '}
      <Link
        to="/login"
        state={state}
        className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline"
      >
        <LogIn aria-hidden className="size-4" />
        {t('inspections.verify.login')}
      </Link>
    </p>
  );
}

function PublicOnly() {
  const { t } = useTranslation();
  return <p className="text-small text-muted-foreground">{t('inspections.verify.publicOnly')}</p>;
}
