import { type DateOnly, effectivePermitStatus, type EffectivePermitStatus } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { PrismaService } from '../../../database/prisma.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { WatersService } from '../../waters/waters.service';
import { fromDbDate } from '../permit-dates';
import { permitWaters } from '../permit-waters';
import { QrTokenService } from '../qr/qr-token.service';

/** A permit as a check by its QR code sees it (T-19): the computed status and what it covers. */
export interface InspectedPermit {
  id: string;
  number: string;
  /** The holder; their data come from UsersModule. */
  userId: string;
  status: EffectivePermitStatus;
  validFrom: DateOnly;
  validTo: DateOnly;
  permitType: { name: string };
  /** The owner of the type: its inspectors and admins see more and write protocols. */
  organization: { id: string; name: string };
  /** The waters of the type, which the permit covers (BR-01), by name. */
  waters: { id: string; name: string }[];
}

/** What a protocol list shows of its permit. */
export interface PermitSummary {
  number: string;
  userId: string;
  permitTypeName: string;
}

/** What the inspections (InspectionsModule) need of permits. */
@Injectable()
export class InspectionPermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrTokens: QrTokenService,
    private readonly organizations: OrganizationsService,
    private readonly waters: WatersService,
    private readonly clock: ClockService,
  ) {}

  /**
   * The permit of a genuine, unexpired QR token (ADR-0006); null for a forged, malformed or
   * expired one. The status is read from the database: the token does not know of a revocation.
   */
  async findByQrToken(token: string, now: Date): Promise<InspectedPermit | null> {
    const id = await this.qrTokens.verify(token);
    return id === null ? null : this.find(id, now);
  }

  /** The status is computed at `now`: the caller uses the same instant for «today». */
  async find(id: string, now: Date = this.clock.now()): Promise<InspectedPermit | null> {
    const permit = await this.prisma.permit.findUnique({
      where: { id },
      include: { permitType: { include: { waters: { select: { id: true } } } } },
    });
    if (!permit) {
      return null;
    }
    const { permitType: type } = permit;
    const [organization, waterNames] = await Promise.all([
      this.organizations.findPublicProfile(type.organizationId),
      this.waters.findNames(type.waters.map((water) => water.id)),
    ]);
    const validFrom = fromDbDate(permit.validFrom);
    const validTo = fromDbDate(permit.validTo);
    return {
      id: permit.id,
      number: permit.number,
      userId: permit.userId,
      status: effectivePermitStatus({ status: permit.status, validFrom, validTo }, now),
      validFrom,
      validTo,
      permitType: { name: type.name },
      // The type keeps its organization (FK), so the profile always exists.
      organization: { id: type.organizationId, name: organization?.name ?? '' },
      waters: permitWaters(type.waters, waterNames),
    };
  }

  /** Numbers, holders and type names of permits, keyed by id. */
  async findSummaries(ids: string[]): Promise<Map<string, PermitSummary>> {
    const permits = await this.prisma.permit.findMany({
      where: { id: { in: ids } },
      select: { id: true, number: true, userId: true, permitType: { select: { name: true } } },
    });
    return new Map(
      permits.map((permit) => [
        permit.id,
        { number: permit.number, userId: permit.userId, permitTypeName: permit.permitType.name },
      ]),
    );
  }
}
