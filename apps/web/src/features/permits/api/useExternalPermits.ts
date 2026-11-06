import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { refreshAndSync } from '../../../shared/offline/device-data';
import { useSessionStatus } from '../../auth/api/useAuth';

export type ExternalPermit = components['schemas']['ExternalPermitDto'];
export type ExternalPermitBody = components['schemas']['CreateExternalPermitDto'];
export type ExternalPermitChanges = components['schemas']['UpdateExternalPermitDto'];

const listKey = ['me', 'external-permits'] as const;
const itemKey = (id: string) => [...listKey, id] as const;

/**
 * External permits of the angler (FR-26), latest start first. An offline session has no token
 * to ask with: the catch form takes them from the device instead.
 */
export function useExternalPermits() {
  const offline = useSessionStatus() === 'offline';
  return useQuery({
    enabled: !offline,
    queryKey: listKey,
    queryFn: ({ signal }) => request(() => api.GET('/api/v1/me/external-permits', { signal })),
  });
}

export function useExternalPermit(id: string) {
  return useQuery({
    queryKey: itemKey(id),
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/me/external-permits/{id}', { params: { path: { id } }, signal }),
      ),
  });
}

/**
 * After a change the list is fetched again, and the device too: the catch form offers the
 * permits the device holds (ADR-0009), so a new or changed permit must reach it.
 */
function useChanged() {
  const queryClient = useQueryClient();
  return async (permit?: ExternalPermit) => {
    if (permit) {
      queryClient.setQueryData(itemKey(permit.id), permit);
    }
    void refreshAndSync();
    await queryClient.invalidateQueries({ queryKey: listKey, exact: true });
  };
}

/** Uploads the photo or scan of a permit; the generated type says string for the binary part. */
const uploadPhoto = (id: string, file: File) =>
  request(() =>
    api.PUT('/api/v1/me/external-permits/{id}/photo', {
      params: { path: { id } },
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const form = new FormData();
        form.append('file', file);
        return form;
      },
    }),
  );

export interface CreatedExternalPermit {
  permit: ExternalPermit;
  /** The photo could not be stored, though the permit was: it can be added on its page. */
  photoError: unknown;
}

/** A new permit, then its photo; a refused photo does not undo the saved permit. */
export function useCreateExternalPermit() {
  const changed = useChanged();
  return useMutation({
    mutationFn: async ({
      body,
      photo,
    }: {
      body: ExternalPermitBody;
      photo: File | null;
    }): Promise<CreatedExternalPermit> => {
      const permit = await request(() => api.POST('/api/v1/me/external-permits', { body }));
      if (!photo) {
        return { permit, photoError: null };
      }
      try {
        return { permit: await uploadPhoto(permit.id, photo), photoError: null };
      } catch (error) {
        return { permit, photoError: error };
      }
    },
    onSuccess: ({ permit }) => changed(permit),
  });
}

export function useUpdateExternalPermit(id: string) {
  const changed = useChanged();
  return useMutation({
    mutationFn: (body: ExternalPermitChanges) =>
      request(() =>
        api.PATCH('/api/v1/me/external-permits/{id}', { params: { path: { id } }, body }),
      ),
    onSuccess: (permit) => changed(permit),
  });
}

export function useDeleteExternalPermit(id: string) {
  const changed = useChanged();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(() => api.DELETE('/api/v1/me/external-permits/{id}', { params: { path: { id } } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: itemKey(id) });
      await changed();
    },
  });
}

export function useSetExternalPhoto(id: string) {
  const changed = useChanged();
  return useMutation({
    mutationFn: (file: File) => uploadPhoto(id, file),
    onSuccess: (permit) => changed(permit),
  });
}

export function useDeleteExternalPhoto(id: string) {
  const changed = useChanged();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(() =>
        api.DELETE('/api/v1/me/external-permits/{id}/photo', { params: { path: { id } } }),
      ),
    onSuccess: async () => {
      queryClient.setQueryData<ExternalPermit>(itemKey(id), (permit) =>
        permit ? { ...permit, photoType: null } : permit,
      );
      await changed();
    },
  });
}

/** The photo comes with the access token, so it is fetched here and saved from memory. */
export function useExternalPhoto(id: string) {
  return useMutation({
    mutationFn: () =>
      request(() =>
        api.GET('/api/v1/me/external-permits/{id}/photo', {
          params: { path: { id } },
          parseAs: 'blob',
        }),
      ),
  });
}

/** The season register for the owner of the water (FR-27), as a PDF blob. */
export function useExternalRegisterPdf(id: string) {
  return useMutation({
    mutationFn: (season: number) =>
      request(() =>
        api.GET('/api/v1/me/external-permits/{id}/register.pdf', {
          params: { path: { id }, query: { season } },
          parseAs: 'blob',
        }),
      ),
  });
}
