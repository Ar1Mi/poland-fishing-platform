import type { OrganizationStatus, OrgRole } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';

/** What the current user may do in one organization; null — not a member (or no such org). */
export interface OrgAccess {
  organizationId: string;
  status: OrganizationStatus;
  roles: OrgRole[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lookups behind RolesGuard and OrgScopeGuard. Memoised per request object, so a route
 * guarded by both reads the membership once. `find` serves a route whose organization is known
 * only from its data (the owner of a checked permit, T-19).
 */
@Injectable()
export class OrgAccessService {
  private readonly cache = new WeakMap<object, Map<string, Promise<OrgAccess | null>>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  access(request: object, userId: string, organizationId: string): Promise<OrgAccess | null> {
    let perRequest = this.cache.get(request);
    if (!perRequest) {
      perRequest = new Map();
      this.cache.set(request, perRequest);
    }
    let access = perRequest.get(organizationId);
    if (!access) {
      access = this.find(userId, organizationId);
      perRequest.set(organizationId, access);
    }
    return access;
  }

  async isSuperAdmin(userId: string): Promise<boolean> {
    // Read on every request: revoking the flag takes effect without waiting for token expiry.
    return (await this.users.findById(userId))?.isSuperAdmin === true;
  }

  /** Uncached; null when the user is not a member (or there is no such organization). */
  async find(userId: string, organizationId: string): Promise<OrgAccess | null> {
    // Not a UUID cannot name an organization; the column type would reject the query.
    if (!UUID.test(organizationId)) {
      return null;
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true, memberships: { where: { userId }, select: { role: true } } },
    });
    if (!organization || organization.memberships.length === 0) {
      return null;
    }
    return {
      organizationId,
      status: organization.status,
      roles: organization.memberships.map(({ role }) => role),
    };
  }
}
