import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type OrgPermit = components['schemas']['OrgPermitDto'];
export type SoldPermitStatus = components['schemas']['SoldPermitStatus'];

export interface OrgPermitsQuery {
  status?: SoldPermitStatus;
  q?: string;
  page?: number;
}

const orgPermitsKey = (orgId: string) => ['orgs', orgId, 'permits'] as const;

/** Permits sold by the organization (FR-10), a page at a time; the previous page stays shown. */
export function useOrgPermits(orgId: string, query: OrgPermitsQuery) {
  return useQuery({
    queryKey: [...orgPermitsKey(orgId), query],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/permits', {
          params: { path: { orgId }, query },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRevokePermit(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      request(() =>
        api.POST('/api/v1/orgs/{orgId}/permits/{id}/revoke', {
          params: { path: { orgId, id } },
          body: { reason },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgPermitsKey(orgId) }),
  });
}
