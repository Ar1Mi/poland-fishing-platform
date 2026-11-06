import type { InvitationInput, OrgRole } from '@lowisko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { myOrgsQueryKey } from './useMyOrgs';

export type Member = components['schemas']['MemberDto'];
export type Invitation = components['schemas']['InvitationDto'];

const membersKey = (orgId: string) => ['orgs', orgId, 'members'] as const;
const invitationsKey = (orgId: string) => ['orgs', orgId, 'invitations'] as const;

export function useOrgMembers(orgId: string) {
  return useQuery({
    queryKey: membersKey(orgId),
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/members', { params: { path: { orgId } }, signal }),
      ),
  });
}

/** Roles change who may open the organization pages, the current user's too. */
function useRefreshMembers(orgId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: myOrgsQueryKey }),
    ]);
}

export function useSetMemberRoles(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  return useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: OrgRole[] }) =>
      request(() =>
        api.PATCH('/api/v1/orgs/{orgId}/members/{userId}', {
          params: { path: { orgId, userId } },
          body: { roles },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useRemoveMember(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  return useMutation({
    mutationFn: (userId: string) =>
      request(() =>
        api.DELETE('/api/v1/orgs/{orgId}/members/{userId}', {
          params: { path: { orgId, userId } },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useOrgInvitations(orgId: string) {
  return useQuery({
    queryKey: invitationsKey(orgId),
    queryFn: ({ signal }) =>
      request(() =>
        api.GET('/api/v1/orgs/{orgId}/invitations', { params: { path: { orgId } }, signal }),
      ),
  });
}

/** Also sends a pending invitation again: the new email replaces the old link. */
export function useInvite(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InvitationInput) =>
      request(() =>
        api.POST('/api/v1/orgs/{orgId}/invitations', { params: { path: { orgId } }, body }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(orgId) }),
  });
}

export function useCancelInvitation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(() =>
        api.DELETE('/api/v1/orgs/{orgId}/invitations/{id}', { params: { path: { orgId, id } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(orgId) }),
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      request(() => api.POST('/api/v1/invitations/accept', { body: { token } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myOrgsQueryKey }),
  });
}
