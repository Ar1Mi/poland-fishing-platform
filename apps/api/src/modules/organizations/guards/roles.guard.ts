import { ErrorCode, type OrgRole } from '@lowisko/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../../../common/errors/domain-error';
import type { AuthenticatedRequest } from '../../auth/decorators/auth.decorators';
import { ORG_ROLES, SUPER_ADMIN } from '../decorators/org-access.constants';
import { OrgAccessService } from '../org-access.service';
import { authenticatedUser, routeOrgId } from './route-context';

/**
 * `@SuperAdmin()` — the user flag; `@Roles(...)` — a membership role in `:orgId`.
 * Not a member at all → ORG_SCOPE_VIOLATION, a member without the role → FORBIDDEN.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: OrgAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const superAdmin = this.reflector.getAllAndOverride<boolean | undefined>(SUPER_ADMIN, targets);
    const roles = this.reflector.getAllAndOverride<OrgRole[] | undefined>(ORG_ROLES, targets);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = authenticatedUser(request);

    if (superAdmin && !(await this.access.isSuperAdmin(user.id))) {
      throw new DomainError(ErrorCode.FORBIDDEN, undefined, 'Super admin only');
    }
    if (roles) {
      const access = await this.access.access(request, user.id, routeOrgId(request));
      if (!access) {
        throw new DomainError(ErrorCode.ORG_SCOPE_VIOLATION);
      }
      if (!roles.some((role) => access.roles.includes(role))) {
        throw new DomainError(ErrorCode.FORBIDDEN, { requiredRoles: roles });
      }
    }
    return true;
  }
}
