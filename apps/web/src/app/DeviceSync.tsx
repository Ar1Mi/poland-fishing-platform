import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSessionStatus } from '../features/auth/api/useAuth';
import { subscribeSynced } from '../shared/offline/catch-queue';
import { refreshAndSync } from '../shared/offline/device-data';

/**
 * Keeps the angler's device in step with the server (docs/06-frontend.md → «Офлайн»): on open
 * and login, and whenever the network comes back, fresh permits and rules go to IndexedDB and
 * waiting catches to the server. Background Sync is not used: Safari has none (ADR-0009).
 */
export function DeviceSync() {
  const status = useSessionStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    void refreshAndSync();
    const onOnline = () => void refreshAndSync();
    globalThis.addEventListener('online', onOnline);
    return () => globalThis.removeEventListener('online', onOnline);
  }, [status]);

  // Catches that got a verdict change the register on the server.
  useEffect(
    () =>
      subscribeSynced(() => {
        void queryClient.invalidateQueries({ queryKey: ['me', 'catches'] });
      }),
    [queryClient],
  );
  return null;
}
