import type { StatsRange } from '@lowisko/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type OrgStats = components['schemas']['OrgStatsDto'];

/** Statistics of the organization in the period on the screen (FR-19). */
export function useOrgStats(orgId: string, { from, to }: StatsRange) {
  return useQuery({
    queryKey: ['orgs', orgId, 'stats', from, to],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/stats', {
          params: { path: { orgId }, query: { from, to } },
          signal,
        }),
      ),
  });
}

/** The catch export of the period as a CSV blob, fetched with the access token. */
export function useCatchesCsv(orgId: string) {
  return useMutation({
    mutationFn: ({ from, to }: StatsRange) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/catches.csv', {
          params: { path: { orgId }, query: { from, to } },
          parseAs: 'blob',
        }),
      ),
  });
}
