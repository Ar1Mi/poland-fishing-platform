import type { ClaimStatus, ReviewClaimInput } from '@lowisko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type Claim = components['schemas']['ClaimDto'];
export type AdminClaim = components['schemas']['AdminClaimDto'];

const orgClaimsKey = (orgId: string) => ['orgs', orgId, 'claims'] as const;
const adminClaimsKey = ['admin', 'claims'] as const;

export function useOrgClaims(orgId: string) {
  return useQuery({
    queryKey: orgClaimsKey(orgId),
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/claims', { params: { path: { orgId } }, signal }),
      ),
  });
}

export function useSubmitClaim(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fishingWaterId, file }: { fishingWaterId: string; file: File }) =>
      request(() =>
        api.POST('/api/v1/orgs/{orgId}/claims', {
          params: { path: { orgId } },
          // The generated type says string for a binary part; the serializer sends the File.
          body: { fishingWaterId, file: file as unknown as string },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append('fishingWaterId', body.fishingWaterId);
            form.append('file', file);
            return form;
          },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgClaimsKey(orgId) }),
  });
}

/** Super admin queue; without `status` every claim. */
export function useAdminClaims(status: ClaimStatus | undefined) {
  return useQuery({
    queryKey: [...adminClaimsKey, status ?? 'ALL'],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/admin/claims', { params: { query: { status } }, signal })),
  });
}

export function useReviewClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReviewClaimInput & { id: string }) =>
      request(() => api.PATCH('/api/v1/admin/claims/{id}', { params: { path: { id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminClaimsKey }),
  });
}

/** The document comes with the access token, so it is fetched here and saved from memory. */
export function useClaimDocument() {
  return useMutation({
    mutationFn: (id: string) =>
      request(() =>
        api.GET('/api/v1/admin/claims/{id}/document', {
          params: { path: { id } },
          parseAs: 'blob',
        }),
      ),
  });
}
