import type { OrgRole } from '@lowisko/shared';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../guards/org-scope.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ORG_ROLES, SUPER_ADMIN } from './org-access.constants';

/**
 * The route needs one of `roles` in the ACTIVE organization named by `:orgId`. Brings
 * OrgScopeGuard along, in this order, so a route cannot get the role check without the
 * scope/status check and the error code has a fixed priority:
 * ORG_SCOPE_VIOLATION → ORG_NOT_ACTIVE → FORBIDDEN.
 */
export const Roles = (...roles: [OrgRole, ...OrgRole[]]): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(ORG_ROLES, roles), UseGuards(OrgScopeGuard, RolesGuard));

/** The route is for users with `isSuperAdmin` only. */
export const SuperAdmin = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(SUPER_ADMIN, true), UseGuards(RolesGuard));
