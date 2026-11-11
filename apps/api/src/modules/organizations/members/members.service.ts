import { ErrorCode, OrganizationStatus, OrgRole } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../database/prisma.service';
import type { Membership, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { anonymizedEmail, normalizeEmail, UsersService } from '../../users/users.service';
import type { MemberDto } from '../dto/member.dto';

/** Role order of the lists: the admin role first. */
const ROLE_ORDER: readonly OrgRole[] = [OrgRole.ORG_ADMIN, OrgRole.INSPECTOR];
const byRoleOrder = (a: OrgRole, b: OrgRole) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b);

/** What the deletion of an account took in one organization (its AuditLog entry). */
export interface LeftOrganization {
  organizationId: string;
  roles: OrgRole[];
}

/**
 * Members of an organization (FR-04): who holds which role. New members come through
 * invitations; an admin changes roles or removes a member, but an organization always keeps
 * one ORG_ADMIN — every change locks the organization row first, so two admins removing each
 * other at once cannot both succeed.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** By last and first name; members of anonymised accounts last. */
  async list(organizationId: string): Promise<MemberDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const members = await this.toMembers(memberships);
    const collator = new Intl.Collator('pl');
    const key = (member: MemberDto) => `${member.lastName ?? ''}\u0000${member.firstName ?? ''}`;
    return members.sort((a, b) => {
      if ((a.lastName === null) !== (b.lastName === null)) {
        return a.lastName === null ? 1 : -1;
      }
      return collator.compare(key(a), key(b)) || a.userId.localeCompare(b.userId);
    });
  }

  /** Sets every role the member keeps; a request that changes nothing writes nothing. */
  async setRoles(
    organizationId: string,
    actorId: string,
    userId: string,
    roles: OrgRole[],
  ): Promise<MemberDto> {
    const memberships = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndRead(tx, organizationId, userId);
      const held = new Set(current.map((membership) => membership.role));
      const removed = [...held].filter((role) => !roles.includes(role));
      const added = roles.filter((role) => !held.has(role));
      if (removed.length === 0 && added.length === 0) {
        return current;
      }
      if (removed.includes(OrgRole.ORG_ADMIN)) {
        await this.assertAnotherAdmin(tx, organizationId, userId);
      }
      await tx.membership.deleteMany({
        where: { organizationId, userId, role: { in: removed } },
      });
      // An invitation accepted meanwhile may have given the same role (no organization lock).
      await tx.membership.createMany({
        data: added.map((role) => ({ organizationId, userId, role })),
        skipDuplicates: true,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'MEMBER_ROLES_UPDATED',
        entity: 'Organization',
        entityId: organizationId,
        diff: {
          userId,
          from: [...held].sort(byRoleOrder),
          to: [...roles].sort(byRoleOrder),
        },
      });
      return tx.membership.findMany({
        where: { organizationId, userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });
    const [member] = await this.toMembers(memberships);
    return member!;
  }

  /**
   * Takes every role of the member; the last admin stays. The invitations waiting for the
   * member's address go too: a link already sent must not bring the removed member back.
   */
  async remove(organizationId: string, actorId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndRead(tx, organizationId, userId);
      const roles = current.map((membership) => membership.role).sort(byRoleOrder);
      if (roles.includes(OrgRole.ORG_ADMIN)) {
        await this.assertAnotherAdmin(tx, organizationId, userId);
      }
      await tx.membership.deleteMany({ where: { organizationId, userId } });
      const user = await this.users.findById(userId, tx);
      const cancelled = user
        ? await tx.invitation.deleteMany({
            where: { organizationId, email: normalizeEmail(user.email), acceptedAt: null },
          })
        : { count: 0 };
      await this.audit.record(tx, {
        actorId,
        action: 'MEMBER_REMOVED',
        entity: 'Organization',
        entityId: organizationId,
        diff: { userId, roles, cancelledInvitations: cancelled.count },
      });
    });
  }

  /**
   * Account deletion (T-26, ADR-0016), in the caller's transaction: every role of the user in
   * every organization goes, the invitations waiting for the address go, and accepted ones keep
   * the anonymised address instead of the real one. The last ORG_ADMIN of an ACTIVE organization
   * cannot leave (LAST_ORG_ADMIN, `details.organizationIds`) — they hand the role over first; a
   * PENDING or BLOCKED organization cannot invite anyone, so it is left without an admin
   * (decided by the user). Each organization gets a MEMBER_REMOVED entry.
   */
  async removeDeletedAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
  ): Promise<{ left: LeftOrganization[]; cancelledInvitations: number }> {
    const address = normalizeEmail(email);
    // The organizations of the memberships and of the invitations an acceptance could still
    // turn into one. Locked first, in a fixed order, as member changes do (the organization, then
    // its invitations — `remove`): two admins of one organization deleting their accounts at
    // once cannot both leave it without an admin, and an admin removing this member meanwhile
    // does not deadlock with the deletion.
    const [members, invited] = await Promise.all([
      tx.membership.findMany({ where: { userId }, select: { organizationId: true } }),
      tx.invitation.findMany({
        where: { email: address, acceptedAt: null },
        select: { organizationId: true },
      }),
    ]);
    const organizationIds = [...new Set([...members, ...invited].map((row) => row.organizationId))];
    const organizations = await tx.$queryRaw<{ id: string; status: OrganizationStatus }[]>`
      SELECT "id", "status" FROM "Organization" WHERE "id" = ANY(${organizationIds}::uuid[])
      ORDER BY "id" FOR NO KEY UPDATE`;
    // An acceptance under way holds its invitation row: this waits until its membership is
    // committed, and the memberships read below include it.
    const cancelled = await tx.invitation.deleteMany({
      where: { email: address, acceptedAt: null },
    });
    const memberships = await tx.membership.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const left = organizations
      .map(({ id }) => ({
        organizationId: id,
        roles: memberships
          .filter((membership) => membership.organizationId === id)
          .map((membership) => membership.role)
          .sort(byRoleOrder),
      }))
      .filter(({ roles }) => roles.length > 0);
    const lastAdminOf: string[] = [];
    for (const { id, status } of organizations) {
      const isAdmin = left.some(
        ({ organizationId, roles }) => organizationId === id && roles.includes(OrgRole.ORG_ADMIN),
      );
      if (
        isAdmin &&
        status === OrganizationStatus.ACTIVE &&
        (await tx.membership.count({
          where: { organizationId: id, role: OrgRole.ORG_ADMIN, userId: { not: userId } },
        })) === 0
      ) {
        lastAdminOf.push(id);
      }
    }
    if (lastAdminOf.length > 0) {
      throw new DomainError(
        ErrorCode.LAST_ORG_ADMIN,
        { organizationIds: lastAdminOf },
        'Hand the admin role over before deleting the account',
      );
    }
    await tx.membership.deleteMany({ where: { userId } });
    await tx.invitation.updateMany({
      where: { email: address, acceptedAt: { not: null } },
      data: { email: anonymizedEmail(userId) },
    });
    for (const { organizationId, roles } of left) {
      await this.audit.record(tx, {
        actorId: userId,
        action: 'MEMBER_REMOVED',
        entity: 'Organization',
        entityId: organizationId,
        diff: { userId, roles, accountDeleted: true },
      });
    }
    return { left, cancelledInvitations: cancelled.count };
  }

  /**
   * `FOR NO KEY UPDATE` serializes the member changes of one organization without blocking the
   * foreign-key checks (`KEY SHARE`) of inserts that reference it (permit types, claims).
   */
  private async lockAndRead(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<Membership[]> {
    await tx.$queryRaw`
      SELECT "id" FROM "Organization" WHERE "id" = ${organizationId}::uuid FOR NO KEY UPDATE`;
    const memberships = await tx.membership.findMany({
      where: { organizationId, userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (memberships.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Not a member of the organization');
    }
    return memberships;
  }

  private async assertAnotherAdmin(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const others = await tx.membership.count({
      where: { organizationId, role: OrgRole.ORG_ADMIN, userId: { not: userId } },
    });
    if (others === 0) {
      throw new DomainError(
        ErrorCode.LAST_ORG_ADMIN,
        undefined,
        'The organization must keep at least one admin',
      );
    }
  }

  /** One entry per user, in the order of their first membership. */
  private async toMembers(memberships: Membership[]): Promise<MemberDto[]> {
    const byUser = new Map<string, { roles: OrgRole[]; since: Date }>();
    for (const { userId, role, createdAt } of memberships) {
      const entry = byUser.get(userId) ?? { roles: [], since: createdAt };
      entry.roles.push(role);
      byUser.set(userId, entry);
    }
    const contacts = await this.users.findContacts([...byUser.keys()]);
    return [...byUser].map(([userId, { roles, since }]) => {
      const contact = contacts.get(userId);
      return {
        userId,
        firstName: contact?.firstName ?? null,
        lastName: contact?.lastName ?? null,
        email: contact?.email ?? null,
        roles: roles.sort(byRoleOrder),
        since: since.toISOString(),
      };
    });
  }
}
