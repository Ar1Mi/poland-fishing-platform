import type { PermitTypeInput } from '@lowisko/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type PermitType = components['schemas']['PermitTypeDto'];
export type OrgPermitType = components['schemas']['OrgPermitTypeDto'];
export type OrgWater = components['schemas']['OrgWaterDto'];
export type PermitTypeChange = components['schemas']['UpdatePermitTypeDto'];

const orgPermitTypesKey = (orgId: string) => ['orgs', orgId, 'permit-types'] as const;
/** Offers of waters and «od» prices: what anglers see of the types. */
const publicPermitTypesKey = ['permit-types'] as const;

export function useOrgPermitTypes(orgId: string) {
  return useQuery({
    queryKey: orgPermitTypesKey(orgId),
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/permit-types', { params: { path: { orgId } }, signal }),
      ),
  });
}

/** Waters connected to the organization: what its permit types may cover. */
export function useOrgWaters(orgId: string) {
  return useQuery({
    queryKey: ['orgs', orgId, 'waters'],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/waters', { params: { path: { orgId } }, signal }),
      ),
  });
}

function useRefreshPermitTypes(orgId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orgPermitTypesKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: publicPermitTypesKey }),
    ]);
}

export function useCreatePermitType(orgId: string) {
  const refresh = useRefreshPermitTypes(orgId);
  return useMutation({
    mutationFn: (body: PermitTypeInput) =>
      request(() =>
        api.POST('/api/v1/orgs/{orgId}/permit-types', { params: { path: { orgId } }, body }),
      ),
    onSuccess: refresh,
  });
}

export function useUpdatePermitType(orgId: string) {
  const refresh = useRefreshPermitTypes(orgId);
  return useMutation({
    mutationFn: ({ id, ...body }: PermitTypeChange & { id: string }) =>
      request(() =>
        api.PATCH('/api/v1/orgs/{orgId}/permit-types/{id}', {
          params: { path: { orgId, id } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useDeletePermitType(orgId: string) {
  const refresh = useRefreshPermitTypes(orgId);
  return useMutation({
    mutationFn: (id: string) =>
      request(() =>
        api.DELETE('/api/v1/orgs/{orgId}/permit-types/{id}', {
          params: { path: { orgId, id } },
        }),
      ),
    onSuccess: refresh,
  });
}

/** Types on sale for the water card. */
export function useWaterPermitTypes(
  waterId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled,
    queryKey: [...publicPermitTypesKey, 'water', waterId],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/permit-types', { params: { query: { waterId } }, signal })),
  });
}

/** «od» prices of the listed waters, by water id; the previous ones stay while the map moves. */
export function useLowestPrices(waterIds: string[]) {
  const ids = [...waterIds].sort();
  return useQuery({
    enabled: ids.length > 0,
    queryKey: [...publicPermitTypesKey, 'lowest-prices', ids],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/permit-types/lowest-prices', {
          params: { query: { waterIds: ids.join(',') } },
          signal,
        }),
      ),
    select: (prices) => new Map(prices.map((price) => [price.waterId, price.priceGrosze])),
    placeholderData: keepPreviousData,
  });
}
