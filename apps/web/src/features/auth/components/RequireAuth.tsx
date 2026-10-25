import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSessionStatus } from '../api/useAuth';
import type { RedirectState } from './GuestOnly';

/** Pages for logged-in users: a guest logs in first and comes back (GuestOnly reads `from`). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSessionStatus();
  const location = useLocation();
  if (status === 'restoring') {
    return null;
  }
  if (status === 'guest') {
    const state: RedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }
  return children;
}
