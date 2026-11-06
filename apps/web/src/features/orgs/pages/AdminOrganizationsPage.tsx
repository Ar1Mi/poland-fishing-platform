import { OrganizationStatus } from '@lowisko/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { SelectField } from '../../../shared/ui/select';
import { type Organization, useAdminOrgs, useSetOrgStatus } from '../api/useOrganizations';
import { AdminNav } from '../components/AdminNav';

const STATUSES = Object.values(OrganizationStatus);
const ALL = 'ALL';

const STATUS_BADGE = {
  PENDING: 'warning',
  ACTIVE: 'success',
  BLOCKED: 'destructive',
} as const;

/**
 * `/admin/orgs` (FR-03, scenario Д): applications of organizations, oldest first; PENDING by
 * default, the filter in the address. The super admin activates, blocks and activates again.
 */
export function AdminOrganizationsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('status');
  const status: OrganizationStatus | undefined =
    raw === ALL
      ? undefined
      : (STATUSES.find((value) => value === raw) ?? OrganizationStatus.PENDING);
  const organizations = useAdminOrgs(status);
  return (
    <>
      <AdminNav />
      <h1 className="text-h1">{t('orgs.admin.title')}</h1>
      <SelectField
        label={t('orgs.admin.filter')}
        className="max-w-xs"
        value={status ?? ALL}
        onChange={(event) => setSearchParams({ status: event.target.value }, { replace: true })}
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`orgs.orgStatus.${value}`)}
          </option>
        ))}
        <option value={ALL}>{t('orgs.admin.all')}</option>
      </SelectField>
      {organizations.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('orgs.admin.loading')}
        </Badge>
      )}
      {organizations.isError && <ApiErrorAlert error={organizations.error} />}
      {organizations.isSuccess && organizations.data.length === 0 && (
        <p className="text-body">{t('orgs.admin.empty')}</p>
      )}
      {organizations.data?.map((organization) => (
        <OrganizationCard key={organization.id} organization={organization} />
      ))}
    </>
  );
}

function OrganizationCard({ organization }: { organization: Organization }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const setStatus = useSetOrgStatus();
  // Blocking suspends the sales and closes the organization pages: it takes a second click.
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const titleId = `org-${organization.id}`;
  const change = (status: 'ACTIVE' | 'BLOCKED') =>
    setStatus.mutate(
      { id: organization.id, status },
      { onSuccess: () => setConfirmingBlock(false) },
    );
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{organization.name}</CardTitle>
        <Badge variant={STATUS_BADGE[organization.status]}>
          {t(`orgs.orgStatus.${organization.status}`)}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
          <dt className="text-muted-foreground">{t('orgs.admin.nip')}</dt>
          <dd className="font-mono">{organization.nip}</dd>
          <dt className="text-muted-foreground">{t('orgs.admin.kind')}</dt>
          <dd>{t(`orgs.kind.${organization.kind}`)}</dd>
          <dt className="text-muted-foreground">{t('orgs.admin.contactEmail')}</dt>
          <dd className="break-all">{organization.contactEmail}</dd>
          <dt className="text-muted-foreground">{t('orgs.admin.appliedAt')}</dt>
          <dd>{formatDate(organization.createdAt, locale)}</dd>
        </dl>
        {setStatus.isError && <ApiErrorAlert error={setStatus.error} />}
        {organization.status !== 'ACTIVE' ? (
          <Button
            type="button"
            className="w-fit"
            disabled={setStatus.isPending}
            aria-label={t('orgs.admin.activateLabel', { name: organization.name })}
            onClick={() => change('ACTIVE')}
          >
            {organization.status === 'PENDING'
              ? t('orgs.admin.activate')
              : t('orgs.admin.reactivate')}
          </Button>
        ) : confirmingBlock ? (
          <div className="flex flex-col gap-2" role="group" aria-labelledby={`${titleId}-block`}>
            <p id={`${titleId}-block`} className="text-body font-semibold">
              {t('orgs.admin.blockConfirm')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={setStatus.isPending}
                onClick={() => change('BLOCKED')}
              >
                {t('orgs.admin.blockYes')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmingBlock(false)}>
                {t('orgs.admin.blockNo')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            className="w-fit"
            aria-label={t('orgs.admin.blockLabel', { name: organization.name })}
            onClick={() => setConfirmingBlock(true)}
          >
            {t('orgs.admin.block')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
