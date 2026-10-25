import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { type MyOrganization, useMyOrgs } from '../api/useMyOrgs';

/** Entry to the organization sections: one card per organization with what the user may do. */
export function MyOrganizationsPage() {
  const { t } = useTranslation();
  const organizations = useMyOrgs();
  return (
    <>
      <h1 className="text-h1">{t('orgs.mine.title')}</h1>
      {organizations.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('orgs.mine.loading')}
        </Badge>
      )}
      {organizations.isError && <ApiErrorAlert error={organizations.error} />}
      {organizations.isSuccess && organizations.data.length === 0 && (
        <p className="text-body">{t('orgs.mine.empty')}</p>
      )}
      {organizations.data?.map((organization) => (
        <OrganizationCard key={organization.id} organization={organization} />
      ))}
    </>
  );
}

function OrganizationCard({ organization }: { organization: MyOrganization }) {
  const { t } = useTranslation();
  const titleId = `org-${organization.id}`;
  const isAdmin = organization.roles.includes('ORG_ADMIN');
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{organization.name}</CardTitle>
        <p className="text-small text-muted-foreground">
          {organization.roles.map((role) => t(`orgs.role.${role}`)).join(', ')}
        </p>
      </CardHeader>
      <CardContent>
        {organization.status === 'ACTIVE' ? (
          isAdmin && (
            <Link
              to={`/org/${organization.id}/claims`}
              className="flex min-h-11 w-fit items-center font-semibold text-primary underline"
            >
              {t('orgs.mine.claims')}
            </Link>
          )
        ) : (
          <p className="text-body">{t(`orgs.mine.status.${organization.status}`)}</p>
        )}
      </CardContent>
    </Card>
  );
}
