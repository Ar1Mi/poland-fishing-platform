import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Shown while the code of a screen is loaded (lazy routes, T-29); usually for a moment. */
export function PageLoading() {
  const { t } = useTranslation();
  return (
    <p role="status" className="flex items-center gap-2 text-muted-foreground">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      {t('common.app.loading')}
    </p>
  );
}
