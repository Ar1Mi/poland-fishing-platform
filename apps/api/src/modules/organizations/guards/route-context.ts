import type { AuthenticatedRequest, AuthUser } from '../../auth/decorators/auth.decorators';

// Misuse below is a programming error (500), never a client one.

export function authenticatedUser(request: AuthenticatedRequest): AuthUser {
  if (!request.user) {
    throw new Error('Organization guards used on a route without authentication');
  }
  return request.user;
}

export function routeOrgId(request: AuthenticatedRequest): string {
  const orgId = request.params.orgId;
  if (typeof orgId !== 'string') {
    throw new Error('Organization guards need an :orgId route parameter');
  }
  return orgId;
}
