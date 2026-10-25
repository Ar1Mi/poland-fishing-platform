import { useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { useSessionStatus } from '../../auth/api/useAuth';

export type MyOrganization = components['schemas']['MyOrganizationDto'];

export const myOrgsQueryKey = ['me', 'orgs'] as const;

/** Organizations of the logged-in user with the roles held in each; idle for guests. */
export function useMyOrgs() {
  const status = useSessionStatus();
  return useQuery({
    queryKey: myOrgsQueryKey,
    queryFn: ({ signal }) => request(() => api.GET('/api/v1/me/orgs', { signal })),
    enabled: status === 'authenticated',
  });
}

/** Organizations where the user may act as ORG_ADMIN now (the API requires ACTIVE). */
export function activeAdminOrgs(organizations: MyOrganization[] | undefined): MyOrganization[] {
  return (organizations ?? []).filter(
    (organization) => organization.status === 'ACTIVE' && organization.roles.includes('ORG_ADMIN'),
  );
}
