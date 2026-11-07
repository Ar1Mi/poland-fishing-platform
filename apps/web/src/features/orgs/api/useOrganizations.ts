import type { CreateOrganizationInput, OrganizationStatus } from '@lowisko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { myOrgsQueryKey } from './useMyOrgs';

export type Organization = components['schemas']['OrganizationDto'];
export type SettableOrgStatus = components['schemas']['UpdateOrganizationStatusDto']['status'];

const adminOrgsKey = ['admin', 'orgs'] as const;

/** The application (FR-03): the applicant becomes its admin, the organization waits as PENDING. */
export function useApplyOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrganizationInput) =>
      request(() => api.POST('/api/v1/orgs', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myOrgsQueryKey }),
  });
}

/** Super admin list, oldest application first; without `status` every organization. */
export function useAdminOrgs(status: OrganizationStatus | undefined) {
  return useQuery({
    queryKey: [...adminOrgsKey, status ?? 'ALL'],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/admin/orgs', { params: { query: { status } }, signal })),
  });
}

export function useSetOrgStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SettableOrgStatus }) =>
      request(() =>
        api.PATCH('/api/v1/admin/orgs/{id}/status', { params: { path: { id } }, body: { status } }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminOrgsKey }),
        // A blocked organization suspends the sales on its water cards.
        queryClient.invalidateQueries({ queryKey: ['waters'] }),
      ]),
  });
}
