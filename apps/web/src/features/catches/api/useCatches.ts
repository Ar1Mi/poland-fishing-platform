import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { forgetQueued, reflectStored } from '../../../shared/offline/catch-queue';

export type Catch = components['schemas']['CatchDto'];
export type NewCatch = components['schemas']['SyncCatchItemDto'];
export type CatchChange = components['schemas']['UpdateCatchDto'];
export type RuleViolation = components['schemas']['RuleViolationDto'];

const myCatchesKey = ['me', 'catches'] as const;

/**
 * My register of a season (Warsaw year); the current one when `season` is not given.
 * `enabled: false` without a session that reaches the server (offline, ADR-0009).
 */
export function useMyCatches(season?: number, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
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

/** Changes a catch within the BR-07 window; the device then counts it as it is stored. */
export function useUpdateCatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CatchChange & { id: string }) =>
      request(() => api.PATCH('/api/v1/catches/{id}', { params: { path: { id } }, body })),
    onSuccess: (stored) => reflectStored(stored).catch(() => undefined),
    onSettled: () => queryClient.invalidateQueries({ queryKey: myCatchesKey }),
  });
}

/** Deletes a catch within the BR-07 window; the device stops counting it towards the limits. */
export function useDeleteCatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fish: Pick<Catch, 'id' | 'clientId'>) =>
      request(() => api.DELETE('/api/v1/catches/{id}', { params: { path: { id: fish.id } } })),
    onSuccess: (_, fish) => forgetQueued(fish.clientId).catch(() => undefined),
    // Also after a failure: NOT_FOUND or a closed window means the list is out of date.
    onSettled: () => queryClient.invalidateQueries({ queryKey: myCatchesKey }),
  });
}
