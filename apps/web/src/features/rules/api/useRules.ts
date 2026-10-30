import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type Species = components['schemas']['SpeciesDto'];
export type OrgRule = components['schemas']['SpeciesRuleDto'];
export type EffectiveRule = components['schemas']['EffectiveRuleDto'];
export type NewOrgRule = components['schemas']['CreateOrgRuleDto'];
export type RuleChange = components['schemas']['UpdateSpeciesRuleDto'];

const orgRulesKey = (orgId: string) => ['orgs', orgId, 'rules'] as const;
/** Effective rules of waters: what anglers see, changed by any rule of an organization. */
const waterRulesKey = ['water-rules'] as const;

/** The species dictionary (≈ 15 entries); it changes only with a release of the seed. */
export function useSpecies() {
  return useQuery({
    queryKey: ['species'],
    queryFn: ({ signal }) => request(() => api.GET('/api/v1/species', { signal })),
    staleTime: Infinity,
  });
}

export function useOrgRules(orgId: string) {
  return useQuery({
    queryKey: orgRulesKey(orgId),
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/orgs/{orgId}/rules', { params: { path: { orgId } }, signal })),
  });
}

/** Effective rules per species for the water card (FR-16). */
export function useWaterRules(waterId: string) {
  return useQuery({
    queryKey: [...waterRulesKey, waterId],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/waters/{id}/rules', { params: { path: { id: waterId } }, signal }),
      ),
  });
}

function useRefreshRules(orgId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orgRulesKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: waterRulesKey }),
    ]);
}

export function useCreateRule(orgId: string) {
  const refresh = useRefreshRules(orgId);
  return useMutation({
    mutationFn: (body: NewOrgRule) =>
      request(() => api.POST('/api/v1/orgs/{orgId}/rules', { params: { path: { orgId } }, body })),
    onSuccess: refresh,
  });
}

export function useUpdateRule(orgId: string) {
  const refresh = useRefreshRules(orgId);
  return useMutation({
    mutationFn: ({ id, ...body }: RuleChange & { id: string }) =>
      request(() =>
        api.PATCH('/api/v1/orgs/{orgId}/rules/{id}', { params: { path: { orgId, id } }, body }),
      ),
    onSuccess: refresh,
  });
}

export function useDeleteRule(orgId: string) {
  const refresh = useRefreshRules(orgId);
  return useMutation({
    mutationFn: (id: string) =>
      request(() =>
        api.DELETE('/api/v1/orgs/{orgId}/rules/{id}', { params: { path: { orgId, id } } }),
      ),
    // Also after a failure: NOT_FOUND means the list on screen is out of date.
    onSettled: refresh,
  });
}
