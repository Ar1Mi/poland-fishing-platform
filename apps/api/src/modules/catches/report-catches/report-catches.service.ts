import {
  type CatchSyncStatus,
  type RuleViolation,
  type StatsRange,
  statsRangeBounds,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { SpeciesService } from '../../rules/species.service';
import { WatersService } from '../../waters/waters.service';

/** Accepted catches of one species on one water, kept or released (T-24). */
export interface CatchCount {
  speciesId: string;
  water: { id: string; name: string };
  kept: boolean;
  count: number;
}

/** A catch as the organization's export lists it: no angler, no position (T-24). */
export interface ExportedCatch {
  caughtAt: Date;
  permitNumber: string;
  waterName: string;
  /** Polish: the export is a Polish document, like the season register (T-22). */
  speciesName: string;
  lengthCm: number;
  weightG: number | null;
  kept: boolean;
  status: CatchSyncStatus;
  violations: RuleViolation[];
}

/**
 * The catches an organization sees in its statistics and export (FR-19): the ones recorded on its
 * permits — never on other permits or external ones, even on its waters (minimisation, as at an
 * inspection, T-19). Which permits those are is PermitsModule's: `permits` is its relation
 * `("id", "number")` (`ReportPermitsService.ofOrganization`), joined by the catch's permit.
 */
@Injectable()
export class ReportCatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waters: WatersService,
    private readonly species: SpeciesService,
  ) {}

  /** Accepted catches in the period (Warsaw days of `caughtAt`) by species, water and kept. */
  async counts(permits: Prisma.Sql, range: StatsRange): Promise<CatchCount[]> {
    const { start, end } = statsRangeBounds(range);
    const rows = await this.prisma.$queryRaw<
      { speciesId: string; waterId: string; kept: boolean; count: number }[]
    >`
      SELECT c."speciesId", c."fishingWaterId" AS "waterId", c."kept", count(*)::int AS "count"
      FROM "CatchRecord" c
      JOIN (${permits}) p ON p."id" = c."permitId"
      WHERE c."syncStatus" = 'ACCEPTED'
        AND c."caughtAt" >= ${start} AND c."caughtAt" < ${end}
      GROUP BY c."speciesId", c."fishingWaterId", c."kept"`;
    const names = await this.waters.findNames([...new Set(rows.map((row) => row.waterId))]);
    return rows.map(({ waterId, ...row }) => ({
      ...row,
      water: { id: waterId, name: names.get(waterId) ?? '' },
    }));
  }

  /**
   * Catches in the period, accepted and rejected (with the violations), earliest first. The
   * whole period at once: at most a season (`STATS_RANGE_MAX_DAYS`) of one organization.
   */
  async forExport(permits: Prisma.Sql, range: StatsRange): Promise<ExportedCatch[]> {
    const { start, end } = statsRangeBounds(range);
    const [rows, species] = await Promise.all([
      this.prisma.$queryRaw<
        {
          caughtAt: Date;
          permitNumber: string;
          waterId: string;
          speciesId: string;
          lengthCm: number;
          weightG: number | null;
          kept: boolean;
          status: CatchSyncStatus;
          violations: RuleViolation[] | null;
        }[]
      >`
        SELECT c."caughtAt", p."number" AS "permitNumber", c."fishingWaterId" AS "waterId",
          c."speciesId", c."lengthCm", c."weightG", c."kept", c."syncStatus"::text AS "status",
          c."violations"
        FROM "CatchRecord" c
        JOIN (${permits}) p ON p."id" = c."permitId"
        WHERE c."caughtAt" >= ${start} AND c."caughtAt" < ${end}
        ORDER BY c."caughtAt", c."createdAt", c."id"`,
      this.species.list(),
    ]);
    const waterNames = await this.waters.findNames([...new Set(rows.map((row) => row.waterId))]);
    const speciesNames = new Map(species.map((item) => [item.id, item.namePl]));
    return rows.map(({ waterId, speciesId, violations, ...row }) => ({
      ...row,
      waterName: waterNames.get(waterId) ?? '',
      speciesName: speciesNames.get(speciesId) ?? '',
      violations: violations ?? [],
    }));
  }
}
