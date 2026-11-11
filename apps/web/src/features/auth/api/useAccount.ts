import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, request } from '../../../shared/api/client';

/** RODO access (`GET /me/export`): all the user's data as a JSON file, fetched with the token. */
export function useExportAccount() {
  return useMutation({
    mutationFn: () => request(() => api.GET('/api/v1/me/export', { parseAs: 'blob' })),
  });
}

/** Navigation state of `/account-deleted`: only the deletion itself sets it. */
export interface AccountDeletedState {
  deletedUserId?: string;
}

/**
 * RODO deletion (`DELETE /me`), confirmed by the password. Afterwards `/account-deleted` ends
 * the session: a public page, rendered before the session ends, so the guard of the profile page
 * does not send the new guest to log in (the router renders in a transition, the session status
 * synchronously).
 */
export function useDeleteAccount() {
  const navigate = useNavigate();
  return useMutation<unknown, Error, { password: string; userId: string | undefined }>({
    mutationFn: ({ password }) => request(() => api.DELETE('/api/v1/me', { body: { password } })),
    onSuccess: async (_data, { userId }) => {
      const state: AccountDeletedState = { deletedUserId: userId };
      await navigate('/account-deleted', { replace: true, state });
    },
  });
}
