import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useMyOrgs } from '../../orgs/api/useMyOrgs';
import { type Claim, useOrgClaims } from '../api/useClaims';
import { ClaimForm } from '../components/ClaimForm';
import { ClaimStatusBadge } from '../components/ClaimStatusBadge';

/** Claims of one organization (FR-24): a new one, and the state of those already sent. */
export function OrgClaimsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const waterId = searchParams.get('waterId') ?? undefined;
  const organization = useMyOrgs().data?.find((org) => org.id === orgId);
  const claims = useOrgClaims(orgId);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('claims.org.title')}</h1>
        {organization && <p className="text-muted-foreground">{organization.name}</p>}
      </div>
      {claims.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('claims.org.loading')}
        </Badge>
      )}
      {/* The API decides access (ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN). */}
      {claims.isError && <ApiErrorAlert error={claims.error} />}
      {claims.isSuccess && (
        <>
          <ClaimForm
            orgId={orgId}
            initialWaterId={waterId}
            // The water from the card is used; a reload should not offer it again.
            onSubmitted={() => setSearchParams({}, { replace: true })}
          />
          <ClaimList claims={claims.data} />
        </>
      )}
    </>
  );
}

function ClaimList({ claims }: { claims: Claim[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  return (
    <Card aria-labelledby="claim-list-title">
      <CardHeader>
        <CardTitle id="claim-list-title">{t('claims.org.listTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {claims.length === 0 ? (
          <p className="text-body">{t('claims.org.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <Link
                  to={`/waters/${claim.water.id}`}
                  className="flex min-h-11 w-fit items-center text-body font-semibold text-primary underline"
                >
                  {claim.water.name}
                </Link>
                <ClaimStatusBadge status={claim.status} />
                <p className="text-small text-muted-foreground">
                  {t('claims.org.submittedAt', { date: formatDate(claim.createdAt, locale) })}
                  {claim.reviewedAt &&
                    ` · ${t('claims.org.reviewedAt', { date: formatDate(claim.reviewedAt, locale) })}`}
                </p>
                {claim.comment && (
                  <p className="text-body">
                    {t('claims.org.comment')} {claim.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
