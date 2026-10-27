import { ErrorCode, effectivePermitStatus } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../database/prisma.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import type { MyPermitDto } from '../dto/permit.dto';
import { fromDbDate } from '../permit-dates';

/** The angler's own permits. T-13: one permit, polled by the payment return page. */
@Injectable()
export class MyPermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly clock: ClockService,
  ) {}

  /** A permit of someone else is as unknown as a missing one. */
  async get(userId: string, id: string): Promise<MyPermitDto> {
    const permit = await this.prisma.permit.findFirst({
      where: { id, userId },
      include: { permitType: true },
    });
    if (!permit) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
    }
    const organization = await this.organizations.findPublicProfile(
      permit.permitType.organizationId,
    );
    const validFrom = fromDbDate(permit.validFrom);
    const validTo = fromDbDate(permit.validTo);
    const { permitType: type } = permit;
    return {
      id: permit.id,
      number: permit.number,
      status: effectivePermitStatus(
        { status: permit.status, validFrom, validTo },
        this.clock.now(),
      ),
      validFrom,
      validTo,
      pricePaidGrosze: permit.pricePaidGrosze,
      permitType: {
        id: type.id,
        name: type.name,
        durationDays: type.durationDays,
        discountKind: type.discountKind,
      },
      // The type keeps its organization (FK), so the profile always exists.
      organization: { id: type.organizationId, name: organization?.name ?? '' },
      createdAt: permit.createdAt.toISOString(),
    };
  }
}
