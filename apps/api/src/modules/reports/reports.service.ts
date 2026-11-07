import {
  CATCH_SEASONS,
  ErrorCode,
  STATS_RANGE_MAX_DAYS,
  seasonRange,
  type StatsRange,
  statsRangeIssue,
  warsawDate,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { ReportCatchesService } from '../catches/report-catches/report-catches.service';
import { ReportPermitsService } from '../permits/report-permits/report-permits.service';
import { summarizeCatches } from './catch-stats';
import { catchesCsv } from './catches-csv';
import type { OrgStatsDto, StatsQueryDto } from './dto/stats.dto';

export interface CatchesCsv {
  fileName: string;
  content: Buffer;
}

/**
 * Statistics and the catch export of an organization (FR-19): sales from PermitsModule, catches
 * on the organization's permits from CatchesModule — each module queries its own tables.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly permits: ReportPermitsService,
    private readonly catches: ReportCatchesService,
    private readonly clock: ClockService,
  ) {}

  async stats(organizationId: string, query: StatsQueryDto): Promise<OrgStatsDto> {
    const range = this.rangeOf(query);
    const [sales, counts] = await Promise.all([
      this.permits.sales(organizationId, range),
      this.catches.counts(this.permits.ofOrganization(organizationId), range),
    ]);
    return { ...range, sales, catches: summarizeCatches(counts) };
  }

  async catchesCsv(organizationId: string, query: StatsQueryDto): Promise<CatchesCsv> {
    const range = this.rangeOf(query);
    const catches = await this.catches.forExport(
      this.permits.ofOrganization(organizationId),
      range,
    );
    return {
      fileName: `polowy-${range.from}-${range.to}.csv`,
      content: Buffer.from(catchesCsv(catches), 'utf8'),
    };
  }

  /** The period asked for, or the current season (Warsaw year of `ClockService`). */
  private rangeOf({ from, to }: StatsQueryDto): StatsRange {
    if (from === undefined && to === undefined) {
      return seasonRange(warsawDate(this.clock.now()));
    }
    if (from === undefined || to === undefined) {
      const missing = from === undefined ? 'from' : 'to';
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { [missing]: [`${missing} is required together with the other end`] } },
        'Incomplete period',
      );
    }
    const issue = statsRangeIssue({ from, to });
    if (issue) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { to: [RANGE_MESSAGE[issue]] } },
        'Invalid period',
      );
    }
    return { from, to };
  }
}

const RANGE_MESSAGE = {
  OUT_OF_SEASONS: `the dates must fall in the years ${CATCH_SEASONS.FIRST}–${CATCH_SEASONS.LAST}`,
  ORDER: 'to must not be before from',
  TOO_LONG: `the period must not be longer than ${STATS_RANGE_MAX_DAYS} days`,
} as const;
