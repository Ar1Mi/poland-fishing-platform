import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { endSession } from '../../../shared/auth/session';
import { clearDeviceData } from '../../../shared/offline/db';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import type { AccountDeletedState } from '../api/useAccount';
import { AuthCard } from '../components/AuthCard';

/**
 * After `DELETE /me` (T-26). Arriving from the deletion, it ends the session like a logout that
 * cannot be undone: this tab forgets the session and every cached answer, the device forgets the
 * user's permits and unsent catches. Opened by hand, it only shows the text.
 */
export function AccountDeletedPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state = useLocation().state as AccountDeletedState | null;
  const deleted = state !== null && 'deletedUserId' in state;
  const userId = state?.deletedUserId;

  useEffect(() => {
    if (!deleted) {
      return;
    }
    endSession();
    queryClient.clear();
    if (userId) {
      void clearDeviceData(userId).catch(() => undefined);
    }
  }, [deleted, userId, queryClient]);

  return (
    <AuthCard title={t('auth.accountDeleted.title')}>
      <Alert variant="success" role="status">
        <CircleCheck aria-hidden />
        <AlertDescription className="text-body">
          {t('auth.accountDeleted.description')}
        </AlertDescription>
      </Alert>
      <Link to="/" className="text-body text-primary underline">
        {t('auth.accountDeleted.home')}
      </Link>
    </AuthCard>
  );
}
