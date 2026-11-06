import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessageKey } from '../../../shared/api/errors';
import { Card, CardContent } from '../../../shared/ui/card';
import { useCreateExternalPermit } from '../api/useExternalPermits';
import { ExternalPermitForm } from '../components/ExternalPermitForm';

/**
 * Router state of the permit page after adding: why the photo did not go with the permit. A key,
 * not the error: history keeps a structured clone, which loses the fields of an `ApiError`.
 */
export interface AddedExternalPermitState {
  photoError: ReturnType<typeof errorMessageKey> | null;
}

/** `/me/external-permits/new?waterId=` — adding a permit, from a water card or the list. */
export function NewExternalPermitPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const create = useCreateExternalPermit();

  return (
    <>
      <Link
        to="/me/external-permits"
        className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary"
      >
        <ArrowLeft aria-hidden className="size-5" />
        {t('permits.external.new.back')}
      </Link>
      <h1 className="text-h1">{t('permits.external.new.title')}</h1>
      <p className="text-body">{t('permits.external.new.lead')}</p>
      <Card>
        <CardContent>
          <ExternalPermitForm
            initialWaterId={params.get('waterId') ?? undefined}
            pending={create.isPending}
            error={create.error}
            onSubmit={(submit) =>
              create.mutate(submit, {
                onSuccess: ({ permit, photoError }) =>
                  void navigate(`/me/external-permits/${permit.id}`, {
                    replace: true,
                    state: {
                      photoError: photoError === null ? null : errorMessageKey(photoError),
                    } satisfies AddedExternalPermitState,
                  }),
              })
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
