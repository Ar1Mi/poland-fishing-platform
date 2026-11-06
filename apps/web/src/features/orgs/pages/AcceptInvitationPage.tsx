import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { useMe } from '../../auth/api/useAuth';
import { useAcceptInvitation } from '../api/useMembers';

const sectionLink = 'flex min-h-11 w-fit items-center font-semibold text-primary underline';

/**
 * `/invitations/accept?token=` (FR-04): the link from the invitation email, after login. The
 * invitation is accepted only by a click — a link preview or a prefetch must not use it — and
 * only for the account with the invited address (the API checks it).
 */
export function AcceptInvitationPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const me = useMe();
  const accept = useAcceptInvitation();

  if (accept.isSuccess) {
    const { organization, role } = accept.data;
    return (
      <>
        <h1 className="text-h1">{t('orgs.accept.title')}</h1>
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertTitle>
            {t('orgs.accept.joined', {
              name: organization.name,
              role: t(`orgs.role.${role}`),
            })}
          </AlertTitle>
          <AlertDescription>
            {role === 'INSPECTOR' ? t('orgs.accept.inspectorHint') : t('orgs.accept.adminHint')}
          </AlertDescription>
        </Alert>
        <Link to="/org" className={sectionLink}>
          {t('orgs.accept.toMine')}
        </Link>
      </>
    );
  }

  const mismatch =
    accept.error instanceof ApiError && accept.error.code === 'INVITATION_EMAIL_MISMATCH';
  return (
    <>
      <h1 className="text-h1">{t('orgs.accept.title')}</h1>
      {token === '' ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('orgs.accept.noToken')}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="text-body">
            {me.data ? t('orgs.accept.leadAs', { email: me.data.email }) : t('orgs.accept.lead')}
          </p>
          {accept.isError && <ApiErrorAlert error={accept.error} />}
          {mismatch && <p className="text-body">{t('orgs.accept.mismatchHint')}</p>}
          <Button
            type="button"
            className="w-fit"
            disabled={accept.isPending}
            onClick={() => accept.mutate(token)}
          >
            {t('orgs.accept.submit')}
          </Button>
        </>
      )}
    </>
  );
}
