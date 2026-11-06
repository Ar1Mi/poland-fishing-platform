import {
  isRevocable,
  pageCount,
  REVOKE_REASON_MAX_LENGTH,
  revokePermitSchema,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { formatDate, formatPrice } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { TextAreaField, TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import {
  type OrgPermit,
  type SoldPermitStatus,
  useOrgPermits,
  useRevokePermit,
} from '../api/useOrgPermits';
import { PermitStatusBadge } from '../components/PermitStatusBadge';

const STATUSES: SoldPermitStatus[] = ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'REVOKED'];
const ALL = 'ALL';

/**
 * `/org/:orgId/permits` (FR-10): the permits the organization sold, latest purchase first, by
 * status and number (`?status=&q=&page=` in the address). A scheduled or active permit can be
 * revoked with a reason; a refund, if any, is made outside the platform and noted in it.
 */
export function OrgPermitsPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const status = STATUSES.find((value) => value === params.get('status'));
  const q = params.get('q') ?? '';
  const asked = Number(params.get('page'));
  const page = Number.isInteger(asked) && asked > 1 ? asked : 1;
  const permits = useOrgPermits(orgId, { status, q: q || undefined, page });
  const [number, setNumber] = useState(q);
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const pages = permits.data ? pageCount(permits.data.total, permits.data.pageSize) : 1;

  return (
    <>
      <h1 className="text-h1">{t('permits.orgList.title')}</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField
          label={t('permits.orgList.status')}
          className="sm:w-56"
          value={status ?? ALL}
          onChange={(event) =>
            update({
              status: event.target.value === ALL ? undefined : event.target.value,
              page: undefined,
            })
          }
        >
          <option value={ALL}>{t('permits.orgList.all')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`permits.status.${value}`)}
            </option>
          ))}
        </SelectField>
        <form
          role="search"
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: number.trim() || undefined, page: undefined });
          }}
        >
          <TextField
            label={t('permits.orgList.number')}
            type="search"
            maxLength={20}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            aria-label={t('permits.orgList.search')}
          >
            <Search aria-hidden />
          </Button>
        </form>
      </div>
      {permits.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('permits.orgList.loading')}
        </Badge>
      )}
      {permits.isError && <ApiErrorAlert error={permits.error} />}
      {permits.isSuccess && permits.data.items.length === 0 && (
        <p className="text-body">{t('permits.orgList.empty')}</p>
      )}
      {permits.isSuccess && permits.data.items.length > 0 && (
        <>
          <p className="text-small text-muted-foreground" aria-live="polite">
            {t('permits.orgList.total', { count: permits.data.total })}
          </p>
          <ul className="flex flex-col gap-3">
            {permits.data.items.map((permit) => (
              <li key={permit.id}>
                <PermitRow orgId={orgId} permit={permit} />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label={t('permits.orgList.pages')} className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : undefined })}
              >
                {t('permits.orgList.previous')}
              </Button>
              <span className="text-body">{t('permits.orgList.page', { page, pages })}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                {t('permits.orgList.next')}
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

function PermitRow({ orgId, permit }: { orgId: string; permit: OrgPermit }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const [revoking, setRevoking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = `permit-${permit.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="font-mono text-body font-semibold">
          {permit.number}
        </h2>
        <PermitStatusBadge status={permit.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="caption text-muted-foreground">{t('permits.orgList.holder')}</dt>
        <dd>
          {permit.holder
            ? `${permit.holder.firstName} ${permit.holder.lastName}`
            : t('permits.orgList.anonymised')}
        </dd>
        <dt className="caption text-muted-foreground">{t('permits.orgList.type')}</dt>
        <dd>{permit.permitType.name}</dd>
        <dt className="caption text-muted-foreground">{t('permits.orgList.validity')}</dt>
        <dd>
          {t('permits.orgList.range', {
            from: formatDate(permit.validFrom, locale),
            to: formatDate(permit.validTo, locale),
          })}
        </dd>
        <dt className="caption text-muted-foreground">{t('permits.orgList.price')}</dt>
        <dd className="font-mono">{formatPrice(permit.pricePaidGrosze, locale)}</dd>
        <dt className="caption text-muted-foreground">{t('permits.orgList.bought')}</dt>
        <dd>{formatDate(permit.createdAt, locale)}</dd>
        {permit.revokedAt && (
          <>
            <dt className="caption text-muted-foreground">{t('permits.orgList.revokedAt')}</dt>
            <dd>{formatDate(permit.revokedAt, locale)}</dd>
            <dt className="caption text-muted-foreground">{t('permits.orgList.reason')}</dt>
            <dd className="whitespace-pre-line">{permit.revokeReason}</dd>
          </>
        )}
      </dl>
      {isRevocable(permit.status) &&
        (revoking ? (
          <RevokeForm
            orgId={orgId}
            permit={permit}
            onClose={() => {
              setRevoking(false);
              opener.current?.focus();
            }}
          />
        ) : (
          <Button
            ref={opener}
            type="button"
            variant="destructive"
            size="compact"
            className="w-fit"
            aria-label={t('permits.orgList.revokeLabel', { number: permit.number })}
            onClick={() => setRevoking(true)}
          >
            {t('permits.orgList.revoke')}
          </Button>
        ))}
    </article>
  );
}

interface RevokeValues {
  reason: string;
}

/** Revocation is final: the reason is required and the button says what it does. */
function RevokeForm({
  orgId,
  permit,
  onClose,
}: {
  orgId: string;
  permit: OrgPermit;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const revoke = useRevokePermit(orgId);
  const title = useRef<HTMLHeadingElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RevokeValues>({
    resolver: zodResolver(revokePermitSchema),
    defaultValues: { reason: '' },
  });
  useEffect(() => title.current?.focus(), []);
  return (
    <form
      noValidate
      aria-labelledby={`revoke-${permit.id}`}
      className="flex flex-col gap-3 border-t border-border pt-3"
      onSubmit={(event) =>
        void handleSubmit(({ reason }) => revoke.mutate({ id: permit.id, reason }))(event)
      }
    >
      <h3 id={`revoke-${permit.id}`} ref={title} tabIndex={-1} className="text-body font-semibold">
        {t('permits.orgList.revokeTitle', { number: permit.number })}
      </h3>
      <p className="text-small text-muted-foreground">{t('permits.orgList.revokeHint')}</p>
      <TextAreaField
        label={t('permits.orgList.reasonField')}
        maxLength={REVOKE_REASON_MAX_LENGTH}
        error={errors.reason && t('permits.orgList.reasonError')}
        {...register('reason')}
      />
      {revoke.isError && <ApiErrorAlert error={revoke.error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={revoke.isPending}>
          {t('permits.orgList.revokeYes')}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('permits.orgList.revokeNo')}
        </Button>
      </div>
    </form>
  );
}
