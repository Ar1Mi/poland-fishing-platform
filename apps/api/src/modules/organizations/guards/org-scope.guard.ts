import { ErrorCode, OrganizationStatus } from '@lowisko/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';
import type { AuthenticatedRequest } from '../../auth/decorators/auth.decorators';
import { OrgAccessService } from '../org-access.service';
import { authenticatedUser, routeOrgId } from './route-context';

/**
 * Every `/orgs/:orgId/*` route: the user is a member of `:orgId` (any role) and the
 * organization is ACTIVE. An unknown id looks the same as someone else's organization.
 * Super admins get no bypass (docs/01-requirements.md → roles table).
 */
@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(private readonly access: OrgAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = authenticatedUser(request);
    const access = await this.access.access(request, user.id, routeOrgId(request));
    if (!access) {
      throw new DomainError(ErrorCode.ORG_SCOPE_VIOLATION);
    }
    if (access.status !== OrganizationStatus.ACTIVE) {
      throw new DomainError(ErrorCode.ORG_NOT_ACTIVE, { status: access.status });
    }
    return true;
  }
}
