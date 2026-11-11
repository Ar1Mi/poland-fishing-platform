import { CATCH_PHOTO_MAX_BYTES, CATCH_PHOTO_MIME_TYPES, isCatchPhotoType } from '@lowisko/shared';
import { ImageUp, LoaderCircle, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { FileField } from '../../../shared/ui/form-field';
import {
  type Catch,
  useCatchPhoto,
  useDeleteCatchPhoto,
  useSetCatchPhoto,
} from '../api/useCatches';

/**
 * The photo of a catch in its register row (FR-14): shown when there is one, fetched with the
 * token; within the BR-07 window it is added, replaced or removed here. Nothing is rendered for
 * a closed catch without a photo.
 */
export function CatchPhoto({
  fish,
  editable,
  alt,
}: {
  fish: Catch;
  editable: boolean;
  /** Names the catch for a screen reader: species and time, as the row's buttons do. */
  alt: string;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const upload = useSetCatchPhoto(fish.id);
  const remove = useDeleteCatchPhoto(fish.id);
  // The removed photo takes its button with it: the file field gets the focus.
  const fileInput = useRef<HTMLInputElement>(null);
  const hasPhoto = fish.photoType !== null;

  if (!hasPhoto && !editable) {
    return null;
  }

  const choose = (chosen: File | undefined) => {
    setFile(chosen ?? null);
    upload.reset();
    // An empty type (unknown to the browser) is left to the API, which reads the content.
    setFileError(
      chosen && chosen.type && !isCatchPhotoType(chosen.type)
        ? t('catches.photo.type')
        : chosen && chosen.size > CATCH_PHOTO_MAX_BYTES
          ? t('catches.photo.tooBig', { mb: CATCH_PHOTO_MAX_BYTES / (1024 * 1024) })
          : null,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {hasPhoto && <PhotoImage id={fish.id} alt={alt} />}
      {hasPhoto && editable && (
        <Button
          variant="ghost"
          className="w-fit"
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: () => fileInput.current?.focus() })}
        >
          <Trash2 aria-hidden />
          {t('catches.photo.remove')}
        </Button>
      )}
      {remove.isError && <ApiErrorAlert error={remove.error} />}
      {editable && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (file && !fileError) {
              upload.mutate(file, {
                onSuccess: () => {
                  setFile(null);
                  // A new input: the chosen file is not offered again.
                  setInputKey((key) => key + 1);
                },
              });
            }
          }}
        >
          <FileField
            key={inputKey}
            ref={fileInput}
            label={
              hasPhoto
                ? t('catches.photo.replace', { name: alt })
                : t('catches.photo.add', { name: alt })
            }
            hint={t('catches.photo.hint', { mb: CATCH_PHOTO_MAX_BYTES / (1024 * 1024) })}
            accept={CATCH_PHOTO_MIME_TYPES.join(',')}
            error={fileError ?? undefined}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          {upload.isError && <ApiErrorAlert error={upload.error} />}
          {file && !fileError && (
            <Button type="submit" variant="secondary" className="w-fit" disabled={upload.isPending}>
              <ImageUp aria-hidden />
              {t('catches.photo.submit')}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

/** The image from the blob: an object URL that lives as long as the blob is on screen. */
function PhotoImage({ id, alt }: { id: string; alt: string }) {
  const { t } = useTranslation();
  const photo = useCatchPhoto(id);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo.data) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photo.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.data]);

  if (photo.isError) {
    return <ApiErrorAlert error={photo.error} />;
  }
  if (!url) {
    return (
      <Badge variant="neutral" role="status">
        <LoaderCircle aria-hidden className="animate-spin" />
        {t('catches.photo.loading')}
      </Badge>
    );
  }
  return (
    <img
      src={url}
      alt={t('catches.photo.alt', { name: alt })}
      className="max-h-72 w-full rounded-lg border border-border object-cover"
    />
  );
}
