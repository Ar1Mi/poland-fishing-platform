import { PermitStatus, type StatsRange, statsRangeBounds } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { type SalesSummary, summarizeSales } from './sales-summary';

declare const orgPermitsRelation: unique symbol;

/**
 * SQL of the relation `("id", "number")` of an organization's sold permits. Only
 * `ReportPermitsService.ofOrganization` makes one, so a query that joins it cannot be handed
 * arbitrary SQL by mistake: a plain `Prisma.Sql` does not type-check.
 */
export type OrgPermitsRelation = Prisma.Sql & { readonly [orgPermitsRelation]: true };

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
   * The permits the organization sold (`PAID`, `REVOKED` of its types — as in its list of sold
   * permits, T-23) as a relation `("id", "number")` for the catch queries of CatchesModule to join:
   * the catches on them are the ones the organization sees (T-19, T-24). A catch on an abandoned
   * or cancelled payment stays out — the organization sold nothing to that angler. The SQL of the
   * permit tables stays here; the caller only joins the result by `"id"` (ADR-0014).
   */
  ofOrganization(organizationId: string): OrgPermitsRelation {
    return Prisma.sql`
      SELECT p."id", p."number" FROM "Permit" p
      JOIN "PermitType" t ON t."id" = p."permitTypeId"
      WHERE t."organizationId" = ${organizationId}::uuid
        AND p."status" IN (${PermitStatus.PAID}::"PermitStatus", ${PermitStatus.REVOKED}::"PermitStatus")` as OrgPermitsRelation;
  }
}
