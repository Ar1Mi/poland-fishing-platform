import { ErrorCode, OrganizationStatus, OrgRole } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, type Organization } from '../../generated/prisma/client';
import type {
  CreateOrganizationDto,
  MyOrganizationDto,
  OrganizationDto,
  SettableStatus,
} from './dto/organization.dto';

/** Owner of `Organization` and `Membership` (FR-03). */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** An application: the organization starts PENDING and the applicant becomes its ORG_ADMIN. */
  async apply(userId: string, dto: CreateOrganizationDto): Promise<OrganizationDto> {
    const { name, nip, kind, contactEmail } = dto;
    if ((await this.prisma.organization.count({ where: { nip } })) > 0) {
      throw new DomainError(ErrorCode.NIP_TAKEN);
    }
    try {
      const organization = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: { name, nip, kind, contactEmail, status: OrganizationStatus.PENDING },
        });
        await tx.membership.create({
          data: { userId, organizationId: created.id, role: OrgRole.ORG_ADMIN },
        });
        return created;
      });
      return toOrganization(organization);
    } catch (error) {
      // Two applications with one NIP at once: the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError(ErrorCode.NIP_TAKEN);
      }
      throw error;
    }
  }

  /** Organizations the user belongs to, with every role held in each (any status). */
  async listForUser(userId: string): Promise<MyOrganizationDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: [{ organization: { name: 'asc' } }, { role: 'asc' }],
    });
    const byOrg = new Map<string, MyOrganizationDto>();
    for (const { organization, role } of memberships) {
      const entry = byOrg.get(organization.id) ?? {
        id: organization.id,
        name: organization.name,
        kind: organization.kind,
        status: organization.status,
        roles: [],
      };
      entry.roles.push(role);
      byOrg.set(organization.id, entry);
    }
    return [...byOrg.values()];
  }

  /** Super admin list; applications waiting longest come first. */
  async listAll(status?: OrganizationStatus): Promise<OrganizationDto[]> {
    const organizations = await this.prisma.organization.findMany({
      where: { status },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return organizations.map(toOrganization);
  }

  /**
   * What a guest may see of an organization (the owner on a water card); null if unknown.
   * `isActive`: only an ACTIVE organization sells permits (a blocked one is suspended).
   * A purchase passes its transaction client as `db`.
   */
  async findPublicProfile(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; name: string; isActive: boolean } | null> {
    const organization = await db.organization.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    return organization
      ? {
          id: organization.id,
          name: organization.name,
          isActive: organization.status === OrganizationStatus.ACTIVE,
        }
      : null;
  }

  /** Identification of organizations for admin lists (claim queue), keyed by id. */
  async findSummaries(
    ids: string[],
  ): Promise<Map<string, Pick<Organization, 'id' | 'name' | 'nip' | 'status'>>> {
    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, nip: true, status: true },
    });
    return new Map(organizations.map((organization) => [organization.id, organization]));
  }

  /** Activation or blocking; setting the current status again is a no-op. */
  async setStatus(id: string, status: SettableStatus): Promise<OrganizationDto> {
    try {
      return toOrganization(
        await this.prisma.organization.update({ where: { id }, data: { status } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Organization not found');
      }
      throw error;
    }
  }
}

export function toOrganization(organization: Organization): OrganizationDto {
  return {
    id: organization.id,
    name: organization.name,
    nip: organization.nip,
    kind: organization.kind,
    status: organization.status,
    contactEmail: organization.contactEmail,
    createdAt: organization.createdAt.toISOString(),
  };
}
