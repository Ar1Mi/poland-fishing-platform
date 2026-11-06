import type { WaterProfileInput } from '@lowisko/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { WaterDetail } from './useWaters';

/** The card in the cache becomes what the API answered: the edit page and the card agree. */
function useStoreCard(waterId: string) {
  const queryClient = useQueryClient();
  return (water: WaterDetail) => queryClient.setQueryData(['waters', waterId], water);
}

/** Description and season of a connected water (FR-05). */
export function useUpdateWaterProfile(orgId: string, waterId: string) {
  const store = useStoreCard(waterId);
  return useMutation({
    mutationFn: (body: WaterProfileInput) =>
      request(() =>
        api.PATCH('/api/v1/orgs/{orgId}/waters/{id}', {
          params: { path: { orgId, id: waterId } },
          body,
        }),
      ),
    onSuccess: store,
  });
}

export function useSetWaterPhoto(orgId: string, waterId: string) {
  const store = useStoreCard(waterId);
  return useMutation({
    mutationFn: (file: File) =>
      request(() =>
        api.PUT('/api/v1/orgs/{orgId}/waters/{id}/photo', {
          params: { path: { orgId, id: waterId } },
          // The generated type says string for a binary part; the serializer sends the File.
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', file);
            return form;
          },
        }),
      ),
    onSuccess: store,
  });
}

export function useDeleteWaterPhoto(orgId: string, waterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(() =>
        api.DELETE('/api/v1/orgs/{orgId}/waters/{id}/photo', {
          params: { path: { orgId, id: waterId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waters', waterId] }),
  });
}
