import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSessionStatus } from '../api/useAuth';
import type { RedirectState } from './GuestOnly';
import { OfflineUnavailable } from './OfflineUnavailable';

/**
 * Pages for logged-in users: a guest logs in first and comes back (GuestOnly reads `from`).
 * Without network only the angler's `offline` pages work, from what the device holds (ADR-0009).
 */
export function RequireAuth({
  children,
  offline = false,
}: {
  children: ReactNode;
  offline?: boolean;
}) {
  const status = useSessionStatus();
  const location = useLocation();
  if (status === 'restoring') {
    return null;
  }
  if (status === 'guest') {
    const state: RedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }
  if (status === 'offline' && !offline) {
    return <OfflineUnavailable />;
  }
  return children;
}
