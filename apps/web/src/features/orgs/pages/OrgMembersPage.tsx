import {
  INVITATION_TTL_DAYS,
  type InvitationInput,
  invitationSchema,
  memberRolesSchema,
  OrgRole,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { CheckboxField, TextField } from '../../../shared/ui/form-field';
import { SelectField } from '../../../shared/ui/select';
import { useCurrentUserId } from '../../auth/api/useAuth';
import {
  type Invitation,
  type Member,
  useCancelInvitation,
  useInvite,
  useOrgInvitations,
  useOrgMembers,
  useRemoveMember,
  useSetMemberRoles,
} from '../api/useMembers';

const ROLES = Object.values(OrgRole);

/**
 * `/org/:orgId/members` (FR-04): invite admins and inspectors by email, follow the invitations
 * not accepted yet, change the roles of members or remove them. The API keeps the last admin.
 */
export function OrgMembersPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const members = useOrgMembers(orgId);
  return (
    <>
      <h1 className="text-h1">{t('orgs.members.title')}</h1>
      {members.isError ? (
        // Access is decided by the API: without it the page shows the reason and no forms.
        <ApiErrorAlert error={members.error} />
      ) : (
        <>
          <InviteForm orgId={orgId} />
          <PendingInvitations orgId={orgId} />
          <section aria-labelledby="members-title" className="flex flex-col gap-3">
            <h2 id="members-title" className="text-h2">
              {t('orgs.members.listTitle')}
            </h2>
            {members.isPending && (
              <Badge variant="neutral" role="status">
                <LoaderCircle aria-hidden className="animate-spin" />
                {t('orgs.members.loading')}
              </Badge>
            )}
            {members.data?.map((member) => (
              <MemberCard key={member.userId} orgId={orgId} member={member} />
            ))}
          </section>
        </>
      )}
    </>
  );
}

function InviteForm({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const titleId = useId();
  const invite = useInvite(orgId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InvitationInput>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { email: '', role: OrgRole.INSPECTOR },
  });
  const submit = (values: InvitationInput) =>
    invite.mutate(values, { onSuccess: () => reset({ email: '', role: values.role }) });
  return (
    <form
      noValidate
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <h2 id={titleId} className="text-h2">
        {t('orgs.members.inviteTitle')}
      </h2>
      <p className="text-small text-muted-foreground">
        {t('orgs.members.inviteHint', { days: INVITATION_TTL_DAYS })}
      </p>
      <TextField
        label={t('orgs.members.email')}
        type="email"
        autoComplete="off"
        error={errors.email && t('orgs.members.emailError')}
        {...register('email')}
      />
      <SelectField label={t('orgs.members.role')} {...register('role')}>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {t(`orgs.role.${role}`)}
          </option>
        ))}
      </SelectField>
      {invite.isError && <ApiErrorAlert error={invite.error} />}
      {invite.isSuccess && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription>
            {t('orgs.members.invited', { email: invite.data.email })}
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-fit" disabled={invite.isPending}>
        {t('orgs.members.invite')}
      </Button>
    </form>
  );
}

function PendingInvitations({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const invitations = useOrgInvitations(orgId);
  if (!invitations.isSuccess || invitations.data.length === 0) {
    return invitations.isError ? <ApiErrorAlert error={invitations.error} /> : null;
  }
  return (
    <section aria-labelledby="invitations-title" className="flex flex-col gap-3">
      <h2 id="invitations-title" className="text-h2">
        {t('orgs.members.pendingTitle')}
      </h2>
      <ul className="flex flex-col gap-3">
        {invitations.data.map((invitation) => (
          <li key={invitation.id}>
            <InvitationRow orgId={orgId} invitation={invitation} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({ orgId, invitation }: { orgId: string; invitation: Invitation }) {
  const { t, i18n } = useTranslation();
  const resend = useInvite(orgId);
  const cancel = useCancelInvitation(orgId);
  const { email, role } = invitation;
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <p className="text-body font-semibold break-all">{email}</p>
      <p className="text-small text-muted-foreground">
        {t(`orgs.role.${role}`)} ·{' '}
        {invitation.expired
          ? t('orgs.members.expired')
          : t('orgs.members.validUntil', {
              date: formatDate(invitation.expiresAt, i18n.resolvedLanguage ?? 'pl'),
            })}
      </p>
      {(resend.isError || cancel.isError) && <ApiErrorAlert error={resend.error ?? cancel.error} />}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={resend.isPending}
          aria-label={t('orgs.members.resendLabel', { email })}
          onClick={() => resend.mutate({ email, role })}
        >
          {t('orgs.members.resend')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          disabled={cancel.isPending}
          aria-label={t('orgs.members.cancelLabel', { email })}
          onClick={() => cancel.mutate(invitation.id)}
        >
          {t('orgs.members.cancel')}
        </Button>
      </div>
    </article>
  );
}

function MemberCard({ orgId, member }: { orgId: string; member: Member }) {
  const { t, i18n } = useTranslation();
  const me = useCurrentUserId();
  const setRoles = useSetMemberRoles(orgId);
  const remove = useRemoveMember(orgId);
  const [roles, setChosen] = useState<OrgRole[]>(member.roles);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const titleId = `member-${member.userId}`;
  const name =
    member.firstName !== null
      ? `${member.firstName} ${member.lastName ?? ''}`.trim()
      : t('orgs.members.anonymised');
  const changed =
    roles.length !== member.roles.length || roles.some((role) => !member.roles.includes(role));
  const toggle = (role: OrgRole, on: boolean) =>
    setChosen((current) =>
      on
        ? ROLES.filter((r) => r === role || current.includes(r))
        : current.filter((r) => r !== role),
    );
  const error = setRoles.error ?? remove.error;
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>
          {name}
          {member.userId === me && (
            <span className="font-normal text-muted-foreground"> {t('orgs.members.you')}</span>
          )}
        </CardTitle>
        {member.email && (
          <p className="text-small break-all text-muted-foreground">{member.email}</p>
        )}
        <p className="text-small text-muted-foreground">
          {t('orgs.members.since', {
            date: formatDate(member.since, i18n.resolvedLanguage ?? 'pl'),
          })}
        </p>
      </CardHeader>
      <CardContent>
        <fieldset className="flex flex-col">
          <legend className="text-body font-semibold">
            {t('orgs.members.rolesLegend', { name })}
          </legend>
          {ROLES.map((role) => (
            <CheckboxField
              key={role}
              label={t(`orgs.role.${role}`)}
              checked={roles.includes(role)}
              onChange={(event) => toggle(role, event.target.checked)}
            />
          ))}
        </fieldset>
        {error && <ApiErrorAlert error={error} />}
        {setRoles.isSuccess && !changed && (
          <p role="status" className="text-small text-muted-foreground">
            {t('orgs.members.saved')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            // Without roles the member is removed instead (`memberRolesSchema` needs one).
            disabled={
              !changed || !memberRolesSchema.safeParse({ roles }).success || setRoles.isPending
            }
            onClick={() => setRoles.mutate({ userId: member.userId, roles })}
          >
            {t('orgs.members.saveRoles')}
          </Button>
          {!confirmingRemoval && (
            <Button
              type="button"
              variant="destructive"
              size="compact"
              aria-label={t('orgs.members.removeLabel', { name })}
              onClick={() => setConfirmingRemoval(true)}
            >
              {t('orgs.members.remove')}
            </Button>
          )}
        </div>
        {confirmingRemoval && (
          <div className="flex flex-col gap-2" role="group" aria-labelledby={`${titleId}-remove`}>
            <p id={`${titleId}-remove`} className="text-body font-semibold">
              {t('orgs.members.removeConfirm', { name })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(member.userId, { onSettled: () => setConfirmingRemoval(false) })
                }
              >
                {t('orgs.members.removeYes')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmingRemoval(false)}>
                {t('orgs.members.removeNo')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
