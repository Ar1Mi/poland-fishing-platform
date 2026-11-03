import { useMutation, useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import { useSessionStatus } from '../../auth/api/useAuth';

/**
 * All permits of the logged-in angler, latest start first (scenario A, FR-09). An offline
 * session has no token to ask with: the pages show the permits on the device instead.
 */
export function useMyPermits() {
  const offline = useSessionStatus() === 'offline';
  return useQuery({
    enabled: !offline,
    queryKey: ['me', 'permits'],
    queryFn: ({ signal }) => request(() => api.GET('/api/v1/me/permits', { signal })),
  });
}

/** One permit with its QR token; shares the cache key of the payment return page. */
export function useMyPermit(id: string) {
  const offline = useSessionStatus() === 'offline';
  return useQuery({
    enabled: !offline,
    queryKey: ['me', 'permits', id],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/me/permits/{id}', { params: { path: { id } }, signal })),
  });
}

/** The PDF comes with the access token, so it is fetched here and saved from memory. */
export function useMyPermitPdf() {
  return useMutation({
    mutationFn: (id: string) =>
      request(() =>
        api.GET('/api/v1/me/permits/{id}/pdf', { params: { path: { id } }, parseAs: 'blob' }),
      ),
  });
}
