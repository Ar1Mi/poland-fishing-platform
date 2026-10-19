import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessageKey } from '../api/errors';
import { Alert, AlertDescription } from './alert';

/** Translated API error with its code in small print for support (docs/10-design-system.md). */
export function ApiErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertDescription className="text-body">{t(errorMessageKey(error))}</AlertDescription>
      {error instanceof ApiError && (
        <AlertDescription className="font-mono text-label">{error.code}</AlertDescription>
      )}
    </Alert>
  );
}
