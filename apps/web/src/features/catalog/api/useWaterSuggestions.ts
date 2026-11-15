import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type WaterSuggestionBody = components['schemas']['SuggestWaterDto'];
export type AdminWater = components['schemas']['AdminWaterDto'];
export type AdminWaterChanges = components['schemas']['UpdateWaterDto'];

const adminWatersKey = ['admin', 'waters'] as const;

/** Sends a water the angler misses to the moderation queue (FR-25). */
export function useSuggestWater() {
  return useMutation({
    mutationFn: (body: WaterSuggestionBody) =>
      request(() => api.POST('/api/v1/waters/suggestions', { body })),
  });
}

/** The super admin's queue: suggestions not yet published, oldest first. */
export function useWaterSuggestions() {
  return useQuery({
    queryKey: [...adminWatersKey, 'suggestions'],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/admin/waters', { params: { query: { published: false } }, signal }),
      ),
  });
}

/** After a decision the queue is fetched again, and the public catalogue: a new water is on it. */
function useDecided() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminWatersKey }),
      queryClient.invalidateQueries({ queryKey: ['waters'] }),
    ]);
}

/** Corrects the fields of a row and, with `isPublished: true`, publishes a suggestion. */
export function useUpdateAdminWater() {
  const decided = useDecided();
  return useMutation({
    mutationFn: ({ id, ...body }: AdminWaterChanges & { id: string }) =>
      request(() => api.PATCH('/api/v1/admin/waters/{id}', { params: { path: { id } }, body })),
    onSuccess: () => decided(),
  });
}

/** Rejects a suggestion: the unpublished row is removed. */
export function useDeleteAdminWater() {
  const decided = useDecided();
  return useMutation({
    mutationFn: (id: string) =>
      request(() => api.DELETE('/api/v1/admin/waters/{id}', { params: { path: { id } } })),
    onSuccess: () => decided(),
  });
}
