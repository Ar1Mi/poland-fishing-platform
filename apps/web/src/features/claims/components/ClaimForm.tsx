import {
  CLAIM_PROOF_MAX_BYTES,
  CLAIM_PROOF_MIME_TYPES,
  isClaimProofMimeType,
} from '@lowisko/shared';
import { CircleCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/ui/card';
import { FileField, TextField } from '../../../shared/ui/form-field';
import { useWater, useWaters } from '../../catalog/api/useWaters';
import { useSubmitClaim } from '../api/useClaims';

/** Search results offered at once; a longer list means the name should be more precise. */
export const PICKER_LIMIT = 10;

interface WaterOption {
  id: string;
  name: string;
  region: string;
}

interface ClaimFormValues {
  file: FileList | undefined;
}

/**
 * New claim: pick an UNCLAIMED water (or come with one from its card, `initialWaterId`),
 * attach the proof document. The API checks the document's content; the size and the
 * declared type are checked here only to answer before uploading.
 */
export function ClaimForm({
  orgId,
  initialWaterId,
  onSubmitted,
}: {
  orgId: string;
  initialWaterId?: string;
  onSubmitted?: () => void;
}) {
  const { t } = useTranslation();
  const [water, setWater] = useState<WaterOption | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const submit = useSubmitClaim(orgId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClaimFormValues>();

  const initial = useWater(initialWaterId ?? '', { enabled: initialWaterId !== undefined });
  useEffect(() => {
    // A connected water cannot be claimed: the picker starts empty instead.
    if (initial.data?.status === 'UNCLAIMED') {
      setWater({ id: initial.data.id, name: initial.data.name, region: initial.data.region });
    }
  }, [initial.data]);

  const choose = (option: WaterOption | null) => {
    setWater(option);
    setSubmitted(null);
    submit.reset();
  };

  const onSubmit = ({ file }: ClaimFormValues) => {
    const document = file?.[0];
    if (!water || !document) {
      return;
    }
    submit.mutate(
      { fishingWaterId: water.id, file: document },
      {
        onSuccess: () => {
          setSubmitted(water.name);
          setWater(null);
          reset();
          onSubmitted?.();
        },
      },
    );
  };

  return (
    <Card aria-labelledby="claim-form-title">
      <CardHeader>
        <CardTitle id="claim-form-title">{t('claims.form.title')}</CardTitle>
        <CardDescription>{t('claims.form.lead')}</CardDescription>
      </CardHeader>
      <CardContent>
        {submitted && (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription className="text-body">
              {t('claims.form.submitted', { name: submitted })}
            </AlertDescription>
          </Alert>
        )}
        {water ? (
          <div className="flex flex-col gap-2">
            <p className="text-body font-semibold">{t('claims.form.water')}</p>
            <p className="text-body">
              {water.name} · {water.region}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => choose(null)}
            >
              {t('claims.form.changeWater')}
            </Button>
          </div>
        ) : (
          <WaterPicker onChoose={choose} />
        )}
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <FileField
            label={t('claims.form.file')}
            hint={t('claims.form.fileHint')}
            accept={CLAIM_PROOF_MIME_TYPES.join(',')}
            error={errors.file?.message}
            {...register('file', {
              validate: (files) => {
                const document = files?.[0];
                if (!document) return t('claims.form.fileRequired');
                // An empty type (unknown to the browser) is left to the API.
                if (document.type && !isClaimProofMimeType(document.type)) {
                  return t('claims.form.fileType');
                }
                if (document.size > CLAIM_PROOF_MAX_BYTES) return t('claims.form.fileTooBig');
                return true;
              },
            })}
          />
          {!water && submit.isIdle && (
            <p className="text-small text-muted-foreground">{t('claims.form.chooseFirst')}</p>
          )}
          {submit.isError && <ApiErrorAlert error={submit.error} />}
          <Button type="submit" disabled={!water || submit.isPending}>
            {t('claims.form.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Name search over UNCLAIMED waters of the catalogue. */
function WaterPicker({ onChoose }: { onChoose: (water: WaterOption) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const waters = useWaters({ q, status: 'UNCLAIMED' }, { enabled: q !== '' });
  const items = waters.data?.items ?? [];
  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(draft.trim());
        }}
      >
        <TextField
          className="flex-1"
          label={t('claims.form.search')}
          placeholder={t('claims.form.searchPlaceholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('claims.form.searchSubmit')}
        </Button>
      </form>
      {waters.isError && <ApiErrorAlert error={waters.error} />}
      {waters.isSuccess && q !== '' && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {items.length === 0 ? (
            <p className="text-body">{t('claims.form.noResults')}</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label={t('claims.form.results')}>
              {items.slice(0, PICKER_LIMIT).map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-12 w-full justify-start border-border text-left whitespace-normal"
                    onClick={() => onChoose({ id: item.id, name: item.name, region: item.region })}
                  >
                    {item.name} · {item.region}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {(items.length > PICKER_LIMIT || waters.data.truncated) && (
            <p className="text-small text-muted-foreground">{t('claims.form.narrow')}</p>
          )}
        </div>
      )}
    </div>
  );
}
