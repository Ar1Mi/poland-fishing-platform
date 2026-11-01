import {
  EffectivePermitStatus,
  ErrorCode,
  OrganizationStatus,
  OrgRole,
  warsawDate,
  warsawDayEnd,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import type { Inspection, User } from '../../generated/prisma/client';
import { CatchesService } from '../catches/catches.service';
import { OrgAccessService } from '../organizations/org-access.service';
import {
  type InspectedPermit,
  InspectionPermitsService,
} from '../permits/inspection-permits/inspection-permits.service';
import { UsersService } from '../users/users.service';
import type {
  CreateInspectionDto,
  InspectionDto,
  InspectionsQueryDto,
  InspectionViewDto,
  VerificationDto,
} from './dto/inspection.dto';
import { holderInitials } from './holder-initials';

/** Roles of the issuing organization that see the full check and write protocols. */
const INSPECTING_ROLES: readonly OrgRole[] = [OrgRole.INSPECTOR, OrgRole.ORG_ADMIN];

const INVALID: VerificationDto = { valid: false, permit: null, inspection: null };

/**
 * Checks of a permit by its QR code (FR-17, FR-28, ADR-0006) and the inspection protocols of an
 * organization (FR-18).
 */
@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permits: InspectionPermitsService,
    private readonly catches: CatchesService,
    private readonly users: UsersService,
    private readonly orgAccess: OrgAccessService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Anyone gets the validity, type, term, waters and initials; an inspector or admin of the
   * issuing ACTIVE organization also the holder and today's catches. A token that is not genuine
   * (forged, malformed, expired) answers the same as one of an unknown permit.
   */
  async verify(token: string, userId: string | undefined): Promise<VerificationDto> {
    // One instant for the status and for «today»: at midnight they would disagree.
    const now = this.clock.now();
    const permit = await this.permits.findByQrToken(token, now);
    // An anonymised holder (RODO) has no permit to show.
    const holder = permit && (await this.users.findById(permit.userId));
    if (!permit || !holder) {
      return INVALID;
    }
    const inspects =
      userId !== undefined && (await this.mayInspect(userId, permit.organization.id));
    return {
      valid: permit.status === EffectivePermitStatus.ACTIVE,
      permit: {
        status: permit.status,
        validFrom: permit.validFrom,
        validTo: permit.validTo,
        permitType: permit.permitType,
        organization: permit.organization,
        waters: permit.waters,
        holderInitials: holderInitials(holder.firstName, holder.lastName),
      },
      inspection: inspects ? await this.inspectionView(permit, holder, now) : null,
    };
  }

  /**
   * A protocol of a permit of the organization, in any status (a revoked or expired permit is
   * the usual VIOLATION). A permit of another organization is as unknown as a missing one.
   */
  async create(
    organizationId: string,
    inspectorId: string,
    dto: CreateInspectionDto,
  ): Promise<InspectionDto> {
    const permit = await this.permits.find(dto.permitId);
    // The guards accept `:orgId` in any letter case, as Postgres compares UUIDs.
    if (!permit || permit.organization.id !== organizationId.toLowerCase()) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
    }
    const inspection = await this.prisma.inspection.create({
      data: {
        inspectorId,
        permitId: permit.id,
        organizationId: permit.organization.id,
        performedAt: this.clock.now(),
        result: dto.result,
        notes: dto.notes ?? null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
      },
    });
    const [created] = await this.toDtos([inspection]);
    return created!;
  }

  /** Protocols of a season (Warsaw calendar year), latest first; a season is not paged. */
  async list(organizationId: string, { season }: InspectionsQueryDto): Promise<InspectionDto[]> {
    const year = season ?? Number(warsawDate(this.clock.now()).slice(0, 4));
    const rows = await this.prisma.inspection.findMany({
      where: {
        organizationId,
        // From the end of the previous year's last day to the end of this year's.
        performedAt: { gte: warsawDayEnd(`${year - 1}-12-31`), lt: warsawDayEnd(`${year}-12-31`) },
      },
      orderBy: [{ performedAt: 'desc' }, { id: 'asc' }],
    });
    return this.toDtos(rows);
  }

  private async mayInspect(userId: string, organizationId: string): Promise<boolean> {
    const access = await this.orgAccess.find(userId, organizationId);
    return (
      access?.status === OrganizationStatus.ACTIVE &&
      INSPECTING_ROLES.some((role) => access.roles.includes(role))
    );
  }

  private async inspectionView(
    permit: InspectedPermit,
    holder: User,
    now: Date,
  ): Promise<InspectionViewDto> {
    const catches = await this.catches.listForPermitOnDay(permit.id, warsawDate(now));
    return {
      permitId: permit.id,
      number: permit.number,
      holder: {
        firstName: holder.firstName,
        lastName: holder.lastName,
        // `@db.Date`: UTC midnight of the birthday.
        birthYear: holder.birthDate.getUTCFullYear(),
      },
      // Not the angler's positions nor the device's data: what was caught and the verdict.
      catchesToday: catches.map(
        ({ id, water, speciesId, caughtAt, lengthCm, weightG, kept, status, violations }) => ({
          id,
          water,
          speciesId,
          caughtAt,
          lengthCm,
          weightG,
          kept,
          status,
          violations,
        }),
      ),
    };
  }

  private async toDtos(rows: Inspection[]): Promise<InspectionDto[]> {
    const permits = await this.permits.findSummaries([...new Set(rows.map((row) => row.permitId))]);
    const names = await this.users.findNames([
      ...new Set([
        ...rows.map((row) => row.inspectorId),
        ...[...permits.values()].map((permit) => permit.userId),
      ]),
    ]);
    return rows.map((row) => {
      // The protocol's FK keeps the permit.
      const permit = permits.get(row.permitId)!;
      const inspector = names.get(row.inspectorId);
      return {
        id: row.id,
        permit: {
          id: row.permitId,
          number: permit.number,
          permitType: { name: permit.permitTypeName },
          holder: names.get(permit.userId) ?? null,
        },
        inspector: inspector ? { id: row.inspectorId, ...inspector } : null,
        performedAt: row.performedAt.toISOString(),
        result: row.result,
        notes: row.notes,
        lat: row.lat,
        lng: row.lng,
      };
    });
  }
}
