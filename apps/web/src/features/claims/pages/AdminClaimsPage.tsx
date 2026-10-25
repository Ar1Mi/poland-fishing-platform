import { type ClaimDecision, ClaimStatus, reviewClaimSchema } from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { TextAreaField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import {
  type AdminClaim,
  useAdminClaims,
  useClaimDocument,
  useReviewClaim,
} from '../api/useClaims';
import { ClaimStatusBadge } from '../components/ClaimStatusBadge';
import { saveFile } from '../lib/save-file';

const STATUSES = Object.values(ClaimStatus);
const ALL = 'ALL';

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Super admin queue of water claims (FR-24); PENDING by default, filter kept in the URL. */
export function AdminClaimsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('status');
  const status: ClaimStatus | undefined =
    raw === ALL ? undefined : (STATUSES.find((value) => value === raw) ?? ClaimStatus.PENDING);
  const claims = useAdminClaims(status);
  return (
    <>
      <h1 className="text-h1">{t('claims.admin.title')}</h1>
      <SelectField
        label={t('claims.admin.filter')}
        className="max-w-xs"
        value={status ?? ALL}
        onChange={(event) => setSearchParams({ status: event.target.value }, { replace: true })}
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`claims.status.${value}`)}
          </option>
        ))}
        <option value={ALL}>{t('claims.admin.all')}</option>
      </SelectField>
      {claims.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('claims.admin.loading')}
        </Badge>
      )}
      {claims.isError && <ApiErrorAlert error={claims.error} />}
      {claims.isSuccess && claims.data.length === 0 && (
        <p className="text-body">{t('claims.admin.empty')}</p>
      )}
      {claims.isSuccess &&
        claims.data.map((claim) => <AdminClaimCard key={claim.id} claim={claim} />)}
    </>
  );
}

function AdminClaimCard({ claim }: { claim: AdminClaim }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const download = useClaimDocument();
  const titleId = `claim-${claim.id}`;
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>
          <Link to={`/waters/${claim.water.id}`} className="text-primary underline">
            {claim.water.name}
          </Link>
        </CardTitle>
        <p className="text-small text-muted-foreground">
          {claim.water.region} · {t(`catalog.status.${claim.water.status}`)}
        </p>
      </CardHeader>
      <CardContent>
        <ClaimStatusBadge status={claim.status} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
          <dt className="text-muted-foreground">{t('claims.admin.organization')}</dt>
          <dd className="font-semibold">
            {claim.organization.name}
            {claim.organization.status !== 'ACTIVE' && (
              <span className="font-normal text-destructive">
                {' '}
                ({t(`claims.orgStatus.${claim.organization.status}`)})
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">{t('claims.admin.nip')}</dt>
          <dd className="font-mono">{claim.organization.nip}</dd>
          <dt className="text-muted-foreground">{t('claims.admin.submittedAt')}</dt>
          <dd>{formatDate(claim.createdAt, locale)}</dd>
          {claim.comment && (
            <>
              <dt className="text-muted-foreground">{t('claims.admin.comment')}</dt>
              <dd>{claim.comment}</dd>
            </>
          )}
        </dl>
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          disabled={download.isPending}
          onClick={() =>
            download.mutate(claim.id, {
              onSuccess: (blob) =>
                saveFile(
                  blob,
                  `claim-${claim.id}.${EXTENSION_BY_TYPE[claim.documentType] ?? 'bin'}`,
                ),
            })
          }
        >
          <Download aria-hidden />
          {t('claims.admin.document')}
        </Button>
        {download.isError && <ApiErrorAlert error={download.error} />}
        {claim.status === 'PENDING' && <ReviewForm claimId={claim.id} />}
      </CardContent>
    </Card>
  );
}

interface ReviewValues {
  comment?: string;
}

const commentSchema = reviewClaimSchema.pick({ comment: true });

function ReviewForm({ claimId }: { claimId: string }) {
  const { t } = useTranslation();
  const review = useReviewClaim();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewValues>({ resolver: zodResolver(commentSchema) });
  const decide = (decision: ClaimDecision) =>
    handleSubmit(({ comment }) =>
      review.mutate({ id: claimId, decision, comment: comment || undefined }),
    );
  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <TextAreaField
        label={t('claims.admin.commentField')}
        hint={t('claims.admin.commentHint')}
        error={errors.comment && t('claims.admin.commentTooLong')}
        {...register('comment')}
      />
      <p className="text-small text-muted-foreground">{t('claims.admin.approveHint')}</p>
      {review.isError && <ApiErrorAlert error={review.error} />}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={review.isPending}
          onClick={(event) => void decide('APPROVE')(event)}
        >
          {t('claims.admin.approve')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={review.isPending}
          onClick={(event) => void decide('REJECT')(event)}
        >
          {t('claims.admin.reject')}
        </Button>
      </div>
    </form>
  );
}
