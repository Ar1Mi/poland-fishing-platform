import { PermitStatus, type StatsRange, statsRangeBounds } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { type SalesSummary, summarizeSales } from './sales-summary';

/** What the statistics of an organization (ReportsModule, FR-19) need of permits. */
@Injectable()
export class ReportPermitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Permits sold by the organization in the period, by the Warsaw day of purchase. Sold means
   * paid, as in the list of sold permits (T-23): `PAID` and `REVOKED` of its types.
   */
  async sales(organizationId: string, range: StatsRange): Promise<SalesSummary> {
    const { start, end } = statsRangeBounds(range);
    const permits = await this.prisma.permit.findMany({
      where: {
        permitType: { organizationId },
        status: { in: [PermitStatus.PAID, PermitStatus.REVOKED] },
        createdAt: { gte: start, lt: end },
      },
      select: {
        createdAt: true,
        pricePaidGrosze: true,
        status: true,
        permitType: { select: { id: true, name: true } },
      },
    });
    return summarizeSales(
      permits.map(({ status, ...permit }) => ({
        ...permit,
        revoked: status === PermitStatus.REVOKED,
      })),
      range,
    );
  }

  /**
   * The permits of the organization's types in any status, as a relation `("id", "number")` for
   * the catch queries of CatchesModule to join: the catches on them are the ones the organization
   * sees (T-19, T-24). The SQL of the permit tables stays here; the caller only joins the result
   * by `"id"`, so its query needs neither a list of ids nor these tables.
   */
  ofOrganization(organizationId: string): Prisma.Sql {
    return Prisma.sql`
      SELECT p."id", p."number" FROM "Permit" p
      JOIN "PermitType" t ON t."id" = p."permitTypeId"
      WHERE t."organizationId" = ${organizationId}::uuid`;
  }
}
