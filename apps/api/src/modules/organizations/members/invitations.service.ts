import { ErrorCode, INVITATION_TTL_DAYS, Locale, type OrgRole } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../database/prisma.service';
import type { Invitation } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { generateOpaqueToken, hashOpaqueToken } from '../../auth/opaque-token';
import { MailService } from '../../notifications/mail.service';
import { normalizeEmail, UsersService } from '../../users/users.service';
import type { AcceptedInvitationDto, CreateInvitationDto, InvitationDto } from '../dto/member.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExportedInvitation {
  organization: { id: string; name: string };
  role: OrgRole;
  expiresAt: Date;
  acceptedAt: Date | null;
}

/**
 * Invitations to an organization (FR-04). The link carries a random token stored only as its
 * SHA-256 (docs/04-data-model.md); it makes a member only of the account with the invited
 * address — a forwarded or leaked email does not let another account in. A new invitation of
 * the same address and role replaces the pending one: only the latest email works, as with
 * the account links.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  /** The RODO export (T-26): invitations sent to the user's address, accepted or not. */
  async listForEmail(email: string): Promise<ExportedInvitation[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { email: normalizeEmail(email) },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
    return invitations.map(({ organization, role, expiresAt, acceptedAt }) => ({
      organization,
      role,
      expiresAt,
      acceptedAt,
    }));
  }

  /** Not yet accepted, expired ones included (the admin invites again); latest first. */
  async listPending(organizationId: string): Promise<InvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null },
      orderBy: [{ expiresAt: 'desc' }, { id: 'asc' }],
    });
    const now = this.clock.now();
    return invitations.map((invitation) => toInvitation(invitation, now));
  }

  async create(
    organizationId: string,
    actorId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    const email = normalizeEmail(dto.email);
    const { role } = dto;
    const invitee = await this.users.findByEmail(email);
    if (
      invitee &&
      (await this.prisma.membership.count({
        where: { organizationId, userId: invitee.id, role },
      })) > 0
    ) {
      throw new DomainError(ErrorCode.ALREADY_MEMBER, { role }, 'Already holds this role');
    }
    const token = generateOpaqueToken();
    const now = this.clock.now();
    const { invitation, organizationName } = await this.prisma.$transaction(async (tx) => {
      // Two invitations of one address and role at once would both stay pending: one at a time.
      const lockKey = `invitation:${organizationId.toLowerCase()}:${email}:${role}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const replaced = await tx.invitation.deleteMany({
        where: { organizationId, email, role, acceptedAt: null },
      });
      const created = await tx.invitation.create({
        data: {
          organizationId,
          email,
          role,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
        },
        include: { organization: { select: { name: true } } },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'INVITATION_CREATED',
        entity: 'Invitation',
        entityId: created.id,
        diff: { organizationId, email, role, replaced: replaced.count },
      });
      return { invitation: created, organizationName: created.organization.name };
    });
    // After the commit: the link must not reach anyone before its row exists. A mail outage is
    // logged by MailService; the admin sees the pending invitation and can send it again.
    await this.mail.sendInvitation(
      { email, locale: invitee?.locale ?? Locale.pl },
      { organizationName, role },
      token,
    );
    return toInvitation(invitation, now);
  }

  async cancel(organizationId: string, actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pending = await tx.invitation.findFirst({
        where: { id, organizationId, acceptedAt: null },
      });
      if (!pending) {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Invitation not found');
      }
      // Conditional: an invitation accepted meanwhile stays (it is history now).
      const { count } = await tx.invitation.deleteMany({ where: { id, acceptedAt: null } });
      if (count === 0) {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Invitation not found');
      }
      await this.audit.record(tx, {
        actorId,
        action: 'INVITATION_CANCELLED',
        entity: 'Invitation',
        entityId: id,
        diff: { organizationId, email: pending.email, role: pending.role },
      });
    });
  }

  /**
   * INVALID_TOKEN: unknown, cancelled, replaced or already used; INVITATION_EXPIRED: too old
   * (the admin invites again); INVITATION_EMAIL_MISMATCH: logged in to another account. Holding
   * the role already is not an error — the link was opened twice.
   */
  async accept(userId: string, token: string): Promise<AcceptedInvitationDto> {
    const user = await this.users.findById(userId);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!user || !invitation || invitation.acceptedAt) {
      throw new DomainError(ErrorCode.INVALID_TOKEN, undefined, 'Invalid or used invitation');
    }
    const now = this.clock.now();
    if (invitation.expiresAt <= now) {
      throw new DomainError(ErrorCode.INVITATION_EXPIRED, undefined, 'Invitation expired');
    }
    if (normalizeEmail(user.email) !== invitation.email) {
      throw new DomainError(
        ErrorCode.INVITATION_EMAIL_MISMATCH,
        undefined,
        'The invitation is for another email address',
      );
    }
    const { organizationId, role } = invitation;
    await this.prisma.$transaction(async (tx) => {
      // Conditional: a link opened twice at once, or cancelled meanwhile, is used at most once.
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (count === 0) {
        throw new DomainError(ErrorCode.INVALID_TOKEN, undefined, 'Invalid or used invitation');
      }
      await tx.membership.createMany({
        data: [{ organizationId, userId, role }],
        skipDuplicates: true,
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'INVITATION_ACCEPTED',
        entity: 'Invitation',
        entityId: invitation.id,
        diff: { organizationId, role },
      });
    });
    return { organization: invitation.organization, role };
  }
}

function toInvitation(invitation: Invitation, now: Date): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    expired: invitation.expiresAt <= now,
  };
}
