import {
  EXTERNAL_PERMIT_MAX_WATERS,
  EXTERNAL_PERMIT_PHOTO_MAX_BYTES,
  EXTERNAL_PERMIT_PHOTO_MIME_TYPES,
  type ExternalPermitFormValues,
  type ExternalPermitInput,
  externalPermitFormSchema,
  isExternalPermitPhotoType,
  warsawDate,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Button } from '../../../shared/ui/button';
import { FieldError, FileField, TextField } from '../../../shared/ui/form-field';
import { useWater, useWaters } from '../../catalog/api/useWaters';
import type { ExternalPermit } from '../api/useExternalPermits';

/** Search results offered at once; a longer list means the name should be more precise. */
const PICKER_LIMIT = 10;

interface WaterOption {
  id: string;
  name: string;
}

export interface ExternalPermitSubmit {
  body: ExternalPermitInput;
  /** Only when adding: the photo goes with the new permit. */
  photo: File | null;
}

/**
 * A new external permit (with its photo) or changes to `permit` (FR-26). The waters are any
 * from the catalogue; coming from a water card, `initialWaterId` is already chosen.
 */
export function ExternalPermitForm({
  permit,
  initialWaterId,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  permit?: ExternalPermit;
  initialWaterId?: string;
  pending: boolean;
  error: unknown;
  onSubmit: (submit: ExternalPermitSubmit) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const schema = useMemo(() => externalPermitFormSchema(warsawDate(new Date())), []);
  const [waters, setWaters] = useState<WaterOption[]>(permit?.waters ?? []);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<ExternalPermitFormValues, unknown, ExternalPermitInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      issuerName: permit?.issuerName ?? '',
      number: permit?.number ?? '',
      validFrom: permit?.validFrom ?? '',
      validTo: permit?.validTo ?? '',
      waterIds: permit?.waters.map((water) => water.id) ?? [],
    },
  });

  const choose = (next: WaterOption[]) => {
    setWaters(next);
    setValue(
      'waterIds',
      next.map((water) => water.id),
      { shouldValidate: isSubmitted },
    );
  };

  const initial = useWater(initialWaterId ?? '', { enabled: !permit && !!initialWaterId });
  const preset = useRef(false);
  useEffect(() => {
    // Once, and not over waters the angler chose while the card's water was loading.
    if (!initial.data || preset.current) {
      return;
    }
    preset.current = true;
    if (getValues('waterIds').length === 0) {
      const { id, name } = initial.data;
      setWaters([{ id, name }]);
      setValue('waterIds', [id]);
    }
  }, [initial.data, getValues, setValue]);

  const choosePhoto = (file: File | undefined) => {
    setPhoto(file ?? null);
    // An empty type (unknown to the browser) is left to the API, which reads the content.
    setPhotoError(
      file && file.type && !isExternalPermitPhotoType(file.type)
        ? t('permits.external.form.photo.type')
        : file && file.size > EXTERNAL_PERMIT_PHOTO_MAX_BYTES
          ? t('permits.external.form.photo.tooBig')
          : null,
    );
  };

  const issuerError = errors.issuerName?.message;
  const datesError = errors.validTo?.message;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) =>
        void handleSubmit((body) => {
          if (!photoError) {
            onSubmit({ body, photo });
          }
        })(event)
      }
    >
      <TextField
        label={t('permits.external.form.issuer.label')}
        hint={t('permits.external.form.issuer.hint')}
        autoComplete="organization"
        error={
          issuerError &&
          (issuerError === 'REQUIRED'
            ? t('permits.external.form.issuer.required')
            : t('permits.external.form.tooLong'))
        }
        {...register('issuerName')}
      />
      <TextField
        label={t('permits.external.form.number.label')}
        hint={t('permits.external.form.number.hint')}
        className="[&_input]:font-mono"
        error={errors.number && t('permits.external.form.tooLong')}
        {...register('number')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          type="date"
          label={t('permits.external.form.validFrom')}
          error={errors.validFrom && t('permits.external.form.dates.INVALID')}
          {...register('validFrom')}
        />
        <TextField
          type="date"
          label={t('permits.external.form.validTo')}
          error={
            datesError &&
            (datesError === 'ORDER'
              ? t('permits.external.form.dates.ORDER')
              : datesError === 'TOO_LONG'
                ? t('permits.external.form.dates.TOO_LONG')
                : datesError === 'TOO_LATE'
                  ? t('permits.external.form.dates.TOO_LATE')
                  : datesError === 'OUT_OF_SEASONS'
                    ? t('permits.external.form.dates.OUT_OF_SEASONS')
                    : t('permits.external.form.dates.INVALID'))
          }
          {...register('validTo')}
        />
      </div>
      <WatersField
        value={waters}
        onChange={choose}
        error={
          errors.waterIds &&
          (waters.length === 0
            ? t('permits.external.form.waters.required')
            : t('permits.external.form.waters.tooMany', { max: EXTERNAL_PERMIT_MAX_WATERS }))
        }
      />
      {!permit && (
        <FileField
          label={t('permits.external.form.photo.label')}
          hint={t('permits.external.form.photo.hint')}
          accept={EXTERNAL_PERMIT_PHOTO_MIME_TYPES.join(',')}
          error={photoError ?? undefined}
          onChange={(event) => choosePhoto(event.target.files?.[0])}
        />
      )}
      {error !== null && <ApiErrorAlert error={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {permit ? t('permits.external.form.submitEdit') : t('permits.external.form.submitNew')}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('permits.external.form.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * The chosen waters as removable chips, and a name search over the whole catalogue: an external
 * permit may name any water, unclaimed or connected. Not a nested form: Enter searches.
 */
function WatersField({
  value,
  onChange,
  error,
}: {
  value: WaterOption[];
  onChange: (waters: WaterOption[]) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const legendId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const found = useWaters({ q }, { enabled: q !== '' });
  const chosen = new Set(value.map((water) => water.id));
  const items = (found.data?.items ?? []).filter((item) => !chosen.has(item.id));
  const full = value.length >= EXTERNAL_PERMIT_MAX_WATERS;
  const search = () => setQ(draft.trim());
  // A chosen or removed water takes its button away: the search field keeps the focus.
  const searchField = useRef<HTMLInputElement>(null);
  const change = (next: WaterOption[]) => {
    onChange(next);
    searchField.current?.focus();
  };

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-labelledby={legendId}
      aria-describedby={error ? errorId : undefined}
    >
      <legend id={legendId} className="text-body font-semibold">
        {t('permits.external.form.waters.legend')}
      </legend>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('permits.external.form.waters.chosen')}>
          {value.map((water) => (
            <li key={water.id}>
              <Button
                type="button"
                variant="secondary"
                className="h-auto min-h-11 whitespace-normal"
                aria-label={t('permits.external.form.waters.remove', { name: water.name })}
                onClick={() => change(value.filter((item) => item.id !== water.id))}
              >
                {water.name}
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div role="search" className="flex items-end gap-2">
        <TextField
          ref={searchField}
          className="flex-1"
          label={t('permits.external.form.waters.search')}
          placeholder={t('permits.external.form.waters.searchPlaceholder')}
          value={draft}
          enterKeyHint="search"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              search();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={search}>
          <Search aria-hidden />
          {t('permits.external.form.waters.searchSubmit')}
        </Button>
      </div>
      {found.isError && <ApiErrorAlert error={found.error} />}
      {found.isSuccess && q !== '' && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {items.length === 0 ? (
            <p className="text-body">{t('permits.external.form.waters.noResults')}</p>
          ) : (
            <ul
              className="flex flex-col gap-2"
              aria-label={t('permits.external.form.waters.results')}
            >
              {items.slice(0, PICKER_LIMIT).map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-12 w-full justify-start border-border text-left whitespace-normal"
                    disabled={full}
                    onClick={() => change([...value, { id: item.id, name: item.name }])}
                  >
                    {t('permits.external.form.waters.add', {
                      name: item.name,
                      region: item.region,
                    })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {full && items.length > 0 && (
            <p className="text-small text-muted-foreground">
              {t('permits.external.form.waters.full', { max: EXTERNAL_PERMIT_MAX_WATERS })}
            </p>
          )}
          {(items.length > PICKER_LIMIT || found.data.truncated) && (
            <p className="text-small text-muted-foreground">
              {t('permits.external.form.waters.narrow')}
            </p>
          )}
        </div>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  );
}
