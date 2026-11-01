import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { useSessionStatus } from '../../auth/api/useAuth';

export type Verification = components['schemas']['VerificationDto'];
export type VerifiedPermit = components['schemas']['VerifiedPermitDto'];
export type InspectionView = components['schemas']['InspectionViewDto'];
export type Inspection = components['schemas']['InspectionDto'];
export type NewInspection = components['schemas']['CreateInspectionDto'];

const orgInspectionsKey = (orgId: string) => ['orgs', orgId, 'inspections'] as const;

/**
 * The check of a scanned QR code (ADR-0006). Waits for the session to be restored: the answer of
 * an inspector of the issuing organization holds more, and it is fetched again when the user
 * logs in or out on the page. Not refetched on focus — the inspector switches to the camera and
 * back with a protocol half written — and dropped from the cache once the page is left, so the
 * holder's data never outlive the session that was allowed to see them.
 */
export function useVerification(token: string) {
  const status = useSessionStatus();
  return useQuery({
    queryKey: ['verify', token, status],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/verify/{token}', { params: { path: { token } }, signal })),
    enabled: status !== 'restoring',
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
}

export function useCreateInspection(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NewInspection) =>
      request(() =>
        api.POST('/api/v1/orgs/{orgId}/inspections', { params: { path: { orgId } }, body }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgInspectionsKey(orgId) }),
  });
}

/** Protocols of a season (Warsaw year): always the year on the screen, not the server's. */
export function useOrgInspections(orgId: string, season: number) {
  return useQuery({
    queryKey: [...orgInspectionsKey(orgId), season],
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/inspections', {
          params: { path: { orgId }, query: { season } },
          signal,
        }),
      ),
  });
}
