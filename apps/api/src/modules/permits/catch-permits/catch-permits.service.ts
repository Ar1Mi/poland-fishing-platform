import type { PermitSnapshot } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { fromDbDate } from '../permit-dates';

/** The permits of the user that catches are recorded on, for the CatchValidator (BR-01). */
export interface CatchPermits {
  /** Platform permits by id: the stored status, the dates and the waters of the type. */
  platform: Map<string, PermitSnapshot>;
  /** External permits (FR-26) by id: the dates and the waters the angler listed. */
  external: Map<string, PermitSnapshot>;
}

/** What the register (CatchesModule) needs of permits; unknown and foreign ids are left out. */
@Injectable()
export class CatchPermitsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    userId: string,
    { permitIds, externalPermitIds }: { permitIds: string[]; externalPermitIds: string[] },
  ): Promise<CatchPermits> {
    const [platform, external] = await Promise.all([
      this.prisma.permit.findMany({
        where: { id: { in: permitIds }, userId },
        select: {
          id: true,
          status: true,
          validFrom: true,
          validTo: true,
          permitType: { select: { waters: { select: { id: true } } } },
        },
      }),
      this.prisma.externalPermit.findMany({
        where: { id: { in: externalPermitIds }, userId },
        select: { id: true, validFrom: true, validTo: true, waters: { select: { id: true } } },
      }),
    ]);
    return {
      platform: new Map(
        platform.map((permit) => [
          permit.id,
          {
            kind: 'PLATFORM',
            status: permit.status,
            validFrom: fromDbDate(permit.validFrom),
            validTo: fromDbDate(permit.validTo),
            waterIds: permit.permitType.waters.map((water) => water.id),
          },
        ]),
      ),
      external: new Map(
        external.map((permit) => [
          permit.id,
          {
            kind: 'EXTERNAL',
            validFrom: fromDbDate(permit.validFrom),
            validTo: fromDbDate(permit.validTo),
            waterIds: permit.waters.map((water) => water.id),
          },
        ]),
      ),
    };
  }
}
