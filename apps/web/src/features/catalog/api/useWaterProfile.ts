import type { WaterProfileInput } from '@lowisko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { WaterDetail } from './useWaters';

const orgWaterKey = (orgId: string, waterId: string) => ['orgs', orgId, 'waters', waterId] as const;

/**
 * The card of the organization's own water for its edit form. Not the public `GET /waters/:id`:
 * the PWA serves that one stale-while-revalidate, and a form filled from an old copy would send
 * the old values back (`Cache-Control: no-store` here, a path the Service Worker never caches).
 */
export function useOrgWater(orgId: string, waterId: string) {
  return useQuery({
    queryKey: orgWaterKey(orgId, waterId),
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/waters/{id}', {
          params: { path: { orgId, id: waterId } },
          signal,
        }),
      ),
  });
}

/**
 * Every change answers the card: the form takes it, and the public card is asked again (the
 * Service Worker revalidates its copy).
 */
function useStoreCard(orgId: string, waterId: string) {
  const queryClient = useQueryClient();
  return (water: WaterDetail) => {
    queryClient.setQueryData(orgWaterKey(orgId, waterId), water);
    return queryClient.invalidateQueries({ queryKey: ['waters', waterId] });
  };
}

/** Description and season of a connected water (FR-05); only the fields changed in the form. */
export function useUpdateWaterProfile(orgId: string, waterId: string) {
  const store = useStoreCard(orgId, waterId);
  return useMutation({
    mutationFn: (body: Partial<WaterProfileInput>) =>
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
  const store = useStoreCard(orgId, waterId);
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
  const store = useStoreCard(orgId, waterId);
  return useMutation({
    mutationFn: () =>
      request(() =>
        api.DELETE('/api/v1/orgs/{orgId}/waters/{id}/photo', {
          params: { path: { orgId, id: waterId } },
        }),
      ),
    onSuccess: store,
  });
}
