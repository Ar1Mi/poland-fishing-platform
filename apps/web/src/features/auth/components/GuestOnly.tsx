import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSessionStatus } from '../api/useAuth';

export interface RedirectState {
  /** Where to go after login (set by a page that needed an account). */
  from?: string;
  /** Message for the login page after a password reset. */
  notice?: 'passwordReset';
}

/** Login and registration: a logged-in user goes on to where they came from. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useSessionStatus();
  const location = useLocation();
  if (status === 'restoring') {
    return null;
  }
  if (status === 'authenticated') {
    const from = (location.state as RedirectState | null)?.from;
    // Same-origin paths only: `//host` would leave the site.
    const target = from?.startsWith('/') && !from.startsWith('//') ? from : '/';
    return <Navigate to={target} replace />;
  }
  return children;
}
