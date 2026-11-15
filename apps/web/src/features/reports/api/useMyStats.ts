import { useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type MyStats = components['schemas']['MyStatsDto'];

/** My accepted catches of a season (FR-20); the current one when `season` is not given. */
export function useMyStats(season?: number) {
  return useQuery({
    queryKey: ['me', 'stats', season ?? 'current'],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/me/stats', {
          params: { query: season === undefined ? {} : { season } },
          signal,
        }),
      ),
  });
}
