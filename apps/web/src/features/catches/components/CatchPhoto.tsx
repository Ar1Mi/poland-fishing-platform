import { CATCH_PHOTO_MAX_BYTES, CATCH_PHOTO_MIME_TYPES, isCatchPhotoType } from '@lowisko/shared';
import { Image, ImageUp, LoaderCircle, Trash2 } from 'lucide-react';
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
 * The photo of a catch in its register row (FR-14). A photo is fetched with the token only when
 * asked for («Pokaż zdjęcie»): a season is one page, and each original may be 5 MB of mobile data
 * (review T-27). Within the BR-07 window it is added, replaced or removed here. Nothing is
 * rendered for a closed catch without a photo.
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
  const [shown, setShown] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [saved, setSaved] = useState(false);
  const upload = useSetCatchPhoto(fish.id);
  const remove = useDeleteCatchPhoto(fish.id);
  // The button of a removed photo, or the input of a saved one, is gone: the file field — a new
  // element after a save — gets the focus.
  const fileInput = useRef<HTMLInputElement>(null);
  const [focusInput, setFocusInput] = useState(0);
  useEffect(() => {
    if (focusInput > 0) {
      fileInput.current?.focus();
    }
  }, [focusInput]);
  const hasPhoto = fish.photoType !== null;

  if (!hasPhoto && !editable) {
    return null;
  }

  const choose = (chosen: File | undefined) => {
    setFile(chosen ?? null);
    setSaved(false);
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
      {hasPhoto && shown && <PhotoImage id={fish.id} alt={alt} />}
      {hasPhoto && !shown && (
        <Button
          variant="secondary"
          className="w-fit"
          aria-label={t('catches.photo.showLabel', { name: alt })}
          onClick={() => setShown(true)}
        >
          <Image aria-hidden />
          {t('catches.photo.show')}
        </Button>
      )}
      {hasPhoto && editable && (
        <Button
          variant="ghost"
          className="w-fit"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                setShown(false);
                setSaved(false);
                setFocusInput((count) => count + 1);
              },
            })
          }
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
                  setShown(true);
                  setSaved(true);
                  setFocusInput((count) => count + 1);
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
          {saved && (
            <p role="status" className="text-small text-muted-foreground">
              {t('catches.photo.saved')}
            </p>
          )}
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
