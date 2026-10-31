import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type Catch = components['schemas']['CatchDto'];
export type NewCatch = components['schemas']['SyncCatchItemDto'];
export type CatchChange = components['schemas']['UpdateCatchDto'];
export type RuleViolation = components['schemas']['RuleViolationDto'];

const myCatchesKey = ['me', 'catches'] as const;

/** My register of a season (Warsaw year); the current one when `season` is not given. */
export function useMyCatches(season?: number) {
  return useQuery({
    queryKey: [...myCatchesKey, season ?? 'current'],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/me/catches', {
          params: { query: season === undefined ? {} : { season } },
          signal,
        }),
      ),
  });
}

/**
 * Records one catch online (FR-11): the server checks it and stores it ACCEPTED or REJECTED.
 * The offline queue sends batches through the same route (T-21).
 */
export function useRecordCatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: NewCatch) => {
      const { results } = await request(() =>
        api.POST('/api/v1/catches/sync', { body: { items: [item] } }),
      );
      return results[0]!;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myCatchesKey }),
  });
}

export function useUpdateCatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CatchChange & { id: string }) =>
      request(() => api.PATCH('/api/v1/catches/{id}', { params: { path: { id } }, body })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: myCatchesKey }),
  });
}

export function useDeleteCatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(() => api.DELETE('/api/v1/catches/{id}', { params: { path: { id } } })),
    // Also after a failure: NOT_FOUND or a closed window means the list is out of date.
    onSettled: () => queryClient.invalidateQueries({ queryKey: myCatchesKey }),
  });
}
