import { CATCH_SEASONS, STATS_RANGE_MAX_DAYS } from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IfPresent, IsDateOnly } from '../../users/dto/profile.dto';

const PERIOD =
  'Warsaw calendar day, inclusive. `from` and `to` together or neither (the current season, ' +
  `1 January – 31 December); at most ${STATS_RANGE_MAX_DAYS} days, ` +
  `years ${CATCH_SEASONS.FIRST}–${CATCH_SEASONS.LAST}.`;

/** `?from=&to=` of the statistics and the catch export (T-24). */
export class StatsQueryDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-01-01', description: PERIOD })
  @IfPresent()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-12-31', description: PERIOD })
  @IfPresent()
  @IsDateOnly()
  to?: string;
}

export class StatsPermitTypeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Roczne' })
  name!: string;
}

export class PermitTypeSalesDto {
  @ApiProperty({ type: StatsPermitTypeDto })
  permitType!: StatsPermitTypeDto;

  @ApiProperty({ example: 12 })
  count!: number;

  @ApiProperty({ example: 30000 })
  revenueGrosze!: number;

  @ApiProperty({ example: 1, description: 'Of `count`, revoked since' })
  revokedCount!: number;
}

export class MonthSalesDto {
  @ApiProperty({ example: '2026-10', description: 'Warsaw calendar month `YYYY-MM`' })
  month!: string;

  @ApiProperty({ example: 4 })
  count!: number;

  @ApiProperty({ example: 10000 })
  revenueGrosze!: number;
}

export class SalesStatsDto {
  @ApiProperty({ example: 12, description: 'Permits sold: paid, revoked since included' })
  count!: number;

  @ApiProperty({ example: 30000, description: 'Prices paid, revoked permits included' })
  revenueGrosze!: number;

  @ApiProperty({ example: 1 })
  revokedCount!: number;

  @ApiProperty({
    example: 2500,
    description: 'Paid for the revoked ones; a refund, if any, is made outside the platform',
  })
  revokedGrosze!: number;

  @ApiProperty({
    type: [PermitTypeSalesDto],
    description: 'Types that sold anything, highest revenue first',
  })
  byPermitType!: PermitTypeSalesDto[];

  @ApiProperty({ type: [MonthSalesDto], description: 'Every month of the period, empty too' })
  byMonth!: MonthSalesDto[];
}

export class SpeciesCatchesDto {
  @ApiProperty({ format: 'uuid' })
  speciesId!: string;

  @ApiProperty({ example: 6 })
  count!: number;

  @ApiProperty({ example: 2 })
  keptCount!: number;
}

export class StatsWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;
}

export class WaterCatchesDto {
  @ApiProperty({ type: StatsWaterDto })
  water!: StatsWaterDto;

  @ApiProperty({ example: 7 })
  count!: number;

  @ApiProperty({ example: 2 })
  keptCount!: number;
}

export class CatchStatsDto {
  @ApiProperty({ example: 10, description: 'Accepted catches on permits of the organization' })
  count!: number;

  @ApiProperty({ example: 3 })
  keptCount!: number;

  @ApiProperty({ example: 7 })
  releasedCount!: number;

  @ApiProperty({ type: [SpeciesCatchesDto], description: 'Most caught first' })
  bySpecies!: SpeciesCatchesDto[];

  @ApiProperty({ type: [WaterCatchesDto], description: 'Most caught first' })
  byWater!: WaterCatchesDto[];
}

export class OrgStatsDto {
  @ApiProperty({ format: 'date', example: '2026-01-01' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-12-31' })
  to!: string;

  @ApiProperty({ type: SalesStatsDto, description: 'By the Warsaw day of purchase' })
  sales!: SalesStatsDto;

  @ApiProperty({ type: CatchStatsDto, description: 'By the Warsaw day of the catch' })
  catches!: CatchStatsDto;
}
