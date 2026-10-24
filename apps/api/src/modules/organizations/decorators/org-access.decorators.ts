import type { OrgRole } from '@lowisko/shared';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../guards/roles.guard';
import { ORG_ROLES, SUPER_ADMIN } from './org-access.constants';

/**
 * The route needs one of `roles` in the organization named by `:orgId`. Pair with
 * `@UseGuards(OrgScopeGuard)`, which also rejects organizations that are not ACTIVE.
 */
export const Roles = (...roles: [OrgRole, ...OrgRole[]]): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(ORG_ROLES, roles), UseGuards(RolesGuard));

/** The route is for users with `isSuperAdmin` only. */
export const SuperAdmin = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(SUPER_ADMIN, true), UseGuards(RolesGuard));
