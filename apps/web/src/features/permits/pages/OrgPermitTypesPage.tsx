import { CircleCheck, CirclePause, LoaderCircle, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { formatPrice } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useMyOrgs } from '../../orgs/api/useMyOrgs';
import {
  type OrgPermitType,
  type OrgWater,
  useDeletePermitType,
  useOrgPermitTypes,
  useOrgWaters,
  useUpdatePermitType,
} from '../api/usePermitTypes';
import { PermitTypeForm } from '../components/PermitTypeForm';
import { PermitTypeTerms } from '../components/PermitTypeTerms';

/** What the organization sells (FR-07): its permit types, a new one, changes to each. */
export function OrgPermitTypesPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const organization = useMyOrgs().data?.find((org) => org.id === orgId);
  const types = useOrgPermitTypes(orgId);
  const waters = useOrgWaters(orgId);
  // `new`, the id of the type being changed, or nothing.
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const edit = (id: string | null) => {
    setEditing(id);
    setNotice(null);
  };
  const saved = (type: OrgPermitType) => {
    setEditing(null);
    setNotice(t('permits.org.saved', { name: type.name }));
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('permits.org.title')}</h1>
        {organization && <p className="text-muted-foreground">{organization.name}</p>}
      </div>
      {(types.isPending || waters.isPending) && !types.isError && !waters.isError && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.org.loading')}
        </Badge>
      )}
      {/* The API decides access (ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN). */}
      {types.isError ? (
        <ApiErrorAlert error={types.error} />
      ) : (
        waters.isError && <ApiErrorAlert error={waters.error} />
      )}
      {notice && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription className="text-body">{notice}</AlertDescription>
        </Alert>
      )}
      {types.isSuccess && waters.isSuccess && (
        <>
          {waters.data.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-body">{t('permits.org.noWaters')}</p>
                <Link
                  to={`/org/${orgId}/claims`}
                  className="flex min-h-11 w-fit items-center font-semibold text-primary underline"
                >
                  {t('permits.org.noWatersLink')}
                </Link>
              </CardContent>
            </Card>
          ) : editing === 'new' ? (
            <PermitTypeForm
              orgId={orgId}
              waters={waters.data}
              onSaved={saved}
              onCancel={() => edit(null)}
            />
          ) : (
            <Button type="button" className="w-fit" onClick={() => edit('new')}>
              <Plus aria-hidden />
              {t('permits.org.add')}
            </Button>
          )}
          <PermitTypeList
            orgId={orgId}
            types={types.data}
            waters={waters.data}
            editing={editing}
            onEdit={edit}
            onSaved={saved}
            onDeleted={(type) => setNotice(t('permits.org.deleted', { name: type.name }))}
          />
        </>
      )}
    </>
  );
}

function PermitTypeList({
  orgId,
  types,
  waters,
  editing,
  onEdit,
  onSaved,
  onDeleted,
}: {
  orgId: string;
  types: OrgPermitType[];
  waters: OrgWater[];
  editing: string | null;
  onEdit: (id: string | null) => void;
  onSaved: (type: OrgPermitType) => void;
  onDeleted: (type: OrgPermitType) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card aria-labelledby="permit-type-list-title">
      <CardHeader>
        <CardTitle id="permit-type-list-title">{t('permits.org.listTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {types.length === 0 ? (
          <p className="text-body">{t('permits.org.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {types.map((type) => (
              <li key={type.id} className="py-3 first:pt-0 last:pb-0">
                {editing === type.id ? (
                  <PermitTypeForm
                    orgId={orgId}
                    waters={waters}
                    type={type}
                    onSaved={onSaved}
                    onCancel={() => onEdit(null)}
                  />
                ) : (
                  <PermitTypeItem
                    orgId={orgId}
                    type={type}
                    onEdit={() => onEdit(type.id)}
                    onDeleted={() => onDeleted(type)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PermitTypeItem({
  orgId,
  type,
  onEdit,
  onDeleted,
}: {
  orgId: string;
  type: OrgPermitType;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const update = useUpdatePermitType(orgId);
  const remove = useDeletePermitType(orgId);
  // Deleting cannot be undone: it takes a second click.
  const [confirming, setConfirming] = useState(false);
  const busy = update.isPending || remove.isPending;
  const confirmId = `permit-type-${type.id}-confirm`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body font-semibold">{type.name}</p>
          <p className="text-small text-muted-foreground">
            <PermitTypeTerms type={type} />
          </p>
        </div>
        <span className="font-mono text-body font-semibold whitespace-nowrap">
          {formatPrice(type.priceGrosze, locale)}
        </span>
      </div>
      {type.isActive ? (
        <Badge variant="success">
          <CircleCheck aria-hidden />
          {t('permits.org.active')}
        </Badge>
      ) : (
        <Badge variant="warning">
          <CirclePause aria-hidden />
          {t('permits.org.inactive')}
        </Badge>
      )}
      {type.inUse && (
        <p className="flex items-center gap-1 text-small text-muted-foreground">
          <Lock aria-hidden className="size-4 shrink-0" />
          {t('permits.org.inUse')}
        </p>
      )}
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-body">
          {t('permits.org.waters', { count: type.waters.length })}
        </summary>
        <ul className="list-disc pl-6 text-body">
          {type.waters.map((water) => (
            <li key={water.id}>{water.name}</li>
          ))}
        </ul>
      </details>
      {(update.isError || remove.isError) && <ApiErrorAlert error={update.error ?? remove.error} />}
      {confirming ? (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={confirmId}>
          <p id={confirmId} className="text-body font-semibold">
            {t('permits.org.deleteConfirm', { name: type.name })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => remove.mutate(type.id, { onSuccess: onDeleted })}
            >
              {t('permits.org.deleteConfirmYes')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {t('permits.org.deleteConfirmNo')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onEdit}>
            {t('permits.org.edit')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => update.mutate({ id: type.id, isActive: !type.isActive })}
          >
            {type.isActive ? t('permits.org.stopSale') : t('permits.org.resumeSale')}
          </Button>
          {/* A sold type stays on its permits: it can only stop selling. */}
          {!type.inUse && (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {t('permits.org.delete')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
