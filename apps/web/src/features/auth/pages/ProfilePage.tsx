import {
  type LoginInput,
  loginSchema,
  type UpdateProfileInput,
  updateProfileSchema,
  warsawDate,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CircleCheck, Download, LoaderCircle, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { components } from '../../../shared/api/schema';
import { ApiError } from '../../../shared/api/errors';
import { saveFile } from '../../../shared/lib/save-file';
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardDescription, CardTitle } from '../../../shared/ui/card';
import { TextField } from '../../../shared/ui/form-field';
import { useDeleteAccount, useExportAccount } from '../api/useAccount';
import { useMe, useUpdateProfile } from '../api/useAuth';

type Profile = components['schemas']['ProfileDto'];

/** Every field of the form is filled: the card number may be empty (removed). */
const profileFormSchema = updateProfileSchema.required();
type ProfileForm = Required<UpdateProfileInput>;

const passwordSchema = loginSchema.pick({ password: true });

/** `/me/profile` (docs/06-frontend.md): the profile and the RODO rights — export, deletion. */
export function ProfilePage() {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <>
      <h1 className="text-h1">{t('auth.profile.title')}</h1>
      {me.isPending && (
        <Badge variant="neutral" role="status" className="w-fit">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('auth.profile.loading')}
        </Badge>
      )}
      {me.isError && <ApiErrorAlert error={me.error} />}
      {me.data && (
        <>
          <DetailsCard profile={me.data} />
          <ExportCard />
          <DeleteCard userId={me.data.id} />
        </>
      )}
    </>
  );
}

function DetailsCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  // `values`: the saved profile (the cache gets it from PATCH) becomes the form's new state.
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileFormSchema), values: toForm(profile) });

  const onSubmit = (form: ProfileForm) => {
    // Only what was changed here: the language is changed in the header and must not go back.
    const changes: UpdateProfileInput = {};
    if (dirtyFields.firstName) changes.firstName = form.firstName;
    if (dirtyFields.lastName) changes.lastName = form.lastName;
    if (dirtyFields.birthDate) changes.birthDate = form.birthDate;
    if (dirtyFields.anglerCardNo) changes.anglerCardNo = form.anglerCardNo || null;
    update.mutate(changes);
  };

  return (
    <Card aria-labelledby="profile-details">
      <CardTitle id="profile-details">{t('auth.profile.details.title')}</CardTitle>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        <div className="flex flex-col gap-1">
          <span className="text-body font-semibold">{t('auth.fields.email.label')}</span>
          <span className="text-body break-all">{profile.email}</span>
          <span className="text-small text-muted-foreground">
            {t('auth.profile.details.emailHint')}
          </span>
        </div>
        <TextField
          label={t('auth.fields.firstName.label')}
          autoComplete="given-name"
          error={errors.firstName && t('auth.fields.firstName.error')}
          {...register('firstName')}
        />
        <TextField
          label={t('auth.fields.lastName.label')}
          autoComplete="family-name"
          error={errors.lastName && t('auth.fields.lastName.error')}
          {...register('lastName')}
        />
        <TextField
          label={t('auth.fields.birthDate.label')}
          type="date"
          autoComplete="bday"
          hint={t('auth.fields.birthDate.hint')}
          error={errors.birthDate && t('auth.fields.birthDate.error')}
          {...register('birthDate')}
        />
        <TextField
          label={t('auth.fields.anglerCardNo.label')}
          error={errors.anglerCardNo && t('auth.fields.anglerCardNo.error')}
          {...register('anglerCardNo')}
        />
        <p className="text-small text-muted-foreground">{t('auth.profile.details.language')}</p>
        {update.isError && <ApiErrorAlert error={update.error} />}
        {update.isSuccess && (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription className="text-body">
              {t('auth.profile.details.saved')}
            </AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-fit" disabled={update.isPending}>
          {t('auth.profile.details.submit')}
        </Button>
      </form>
    </Card>
  );
}

function toForm(profile: Profile): ProfileForm {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    anglerCardNo: profile.anglerCardNo ?? '',
    locale: profile.locale,
  };
}

function ExportCard() {
  const { t } = useTranslation();
  const exportAccount = useExportAccount();
  return (
    <Card aria-labelledby="profile-export">
      <CardTitle id="profile-export">{t('auth.profile.export.title')}</CardTitle>
      <CardDescription>{t('auth.profile.export.description')}</CardDescription>
      <Link to="/privacy" className="w-fit text-body text-primary underline">
        {t('auth.profile.export.privacy')}
      </Link>
      <Button
        variant="secondary"
        className="w-fit"
        disabled={exportAccount.isPending}
        onClick={() =>
          exportAccount.mutate(undefined, {
            onSuccess: (blob) => saveFile(blob, `lowisko-dane-${warsawDate(new Date())}.json`),
          })
        }
      >
        <Download aria-hidden />
        {t('auth.profile.export.download')}
      </Button>
      {exportAccount.isError && <ApiErrorAlert error={exportAccount.error} />}
    </Card>
  );
}

function DeleteCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const deletion = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const passwordId = useId();
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<Pick<LoginInput, 'password'>>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    if (open) {
      setFocus('password');
    }
  }, [open, setFocus]);

  const close = () => {
    setOpen(false);
    reset();
    deletion.reset();
    // Focus goes back to the button that opened the confirmation.
    setTimeout(() => openButton.current?.focus());
  };

  const code = deletion.error instanceof ApiError ? deletion.error.code : undefined;

  return (
    <Card aria-labelledby="profile-delete" className="border-destructive/40">
      <CardTitle id="profile-delete">{t('auth.profile.delete.title')}</CardTitle>
      <CardDescription>{t('auth.profile.delete.intro')}</CardDescription>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body">
        <li>{t('auth.profile.delete.profile')}</li>
        <li>{t('auth.profile.delete.catches')}</li>
        <li>{t('auth.profile.delete.permits')}</li>
        <li>{t('auth.profile.delete.organizations')}</li>
        <li>{t('auth.profile.delete.device')}</li>
      </ul>
      {!open ? (
        <Button
          ref={openButton}
          variant="destructive"
          className="w-fit"
          onClick={() => setOpen(true)}
        >
          <Trash2 aria-hidden />
          {t('auth.profile.delete.open')}
        </Button>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          aria-labelledby="profile-delete"
          onSubmit={(event) =>
            void handleSubmit(({ password }) => deletion.mutate({ password, userId }))(event)
          }
        >
          <TextField
            id={passwordId}
            label={t('auth.profile.delete.password')}
            type="password"
            autoComplete="current-password"
            error={
              errors.password
                ? t('auth.fields.password.required')
                : code === 'INVALID_CREDENTIALS'
                  ? t('auth.profile.delete.wrongPassword')
                  : undefined
            }
            {...register('password')}
          />
          {code === 'LAST_ORG_ADMIN' && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertTitle>{t('auth.profile.delete.lastOrgAdmin')}</AlertTitle>
              <AlertDescription className="text-body">
                <Link to="/org" className="text-primary underline">
                  {t('auth.profile.delete.organizationsLink')}
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {deletion.isError && code !== 'INVALID_CREDENTIALS' && code !== 'LAST_ORG_ADMIN' && (
            <ApiErrorAlert error={deletion.error} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={deletion.isPending}>
              <Trash2 aria-hidden />
              {t('auth.profile.delete.confirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              {t('auth.profile.delete.cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
