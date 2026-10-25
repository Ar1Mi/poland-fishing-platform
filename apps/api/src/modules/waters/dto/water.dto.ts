import {
  type Bbox,
  isRegion,
  parseBbox,
  REGIONS,
  type Region,
  WATER_QUERY_MAX_LENGTH,
  WATERS_LIST_LIMIT,
  WaterSource,
  WaterStatus,
  WaterType,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateBy } from 'class-validator';
import { trim } from '../../users/dto/profile.dto';

const type = { enum: Object.values(WaterType), enumName: 'WaterType' };
const status = { enum: Object.values(WaterStatus), enumName: 'WaterStatus' };

export class ListWatersQueryDto {
  @ApiPropertyOptional({ enum: REGIONS, enumName: 'Region', description: 'Voivodeship' })
  @IsOptional()
  @ValidateBy({
    name: 'isRegion',
    validator: {
      validate: isRegion,
      defaultMessage: () => 'region must be a voivodeship in lower case, e.g. mazowieckie',
    },
  })
  region?: Region;

  @ApiPropertyOptional(type)
  @IsOptional()
  @IsEnum(WaterType)
  type?: WaterType;

  @ApiPropertyOptional(status)
  @IsOptional()
  @IsEnum(WaterStatus)
  status?: WaterStatus;

  @ApiPropertyOptional({
    maxLength: WATER_QUERY_MAX_LENGTH,
    description: 'Part of the name, case-insensitive',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(WATER_QUERY_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    example: '20.5,52,21.5,52.6',
    description: 'minLng,minLat,maxLng,maxLat; waters without coordinates are left out',
  })
  @IsOptional()
  @ValidateBy({
    name: 'isBbox',
    validator: {
      validate: (value) => typeof value === 'string' && parseBbox(value) !== null,
      defaultMessage: () => 'bbox must be minLng,minLat,maxLng,maxLat with min <= max',
    },
  })
  bbox?: string;
}

export interface WaterFilters {
  region?: Region;
  type?: WaterType;
  status?: WaterStatus;
  q?: string;
  bbox?: Bbox;
}

export class WaterSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;

  @ApiProperty(type)
  type!: WaterType;

  @ApiProperty(status)
  status!: WaterStatus;

  @ApiProperty({ example: 'mazowieckie' })
  region!: string;

  @ApiProperty({ type: Number, nullable: true, example: 52.46 })
  lat!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 21.04 })
  lng!: number | null;
}

export class WaterListDto {
  @ApiProperty({ type: WaterSummaryDto, isArray: true, description: 'Sorted by name' })
  items!: WaterSummaryDto[];

  @ApiProperty({
    description: `More than ${WATERS_LIST_LIMIT} waters match: only the first ${WATERS_LIST_LIMIT} are returned`,
  })
  truncated!: boolean;
}

export class WaterOwnerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description: 'false while the organization is not ACTIVE (blocked): online sales are suspended',
  })
  isActive!: boolean;
}

export class WaterDetailDto extends WaterSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    type: WaterOwnerDto,
    nullable: true,
    description: 'Connected organization; null for an UNCLAIMED water',
  })
  organization!: WaterOwnerDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Użytkownik rybacki from the catalogue source',
  })
  externalOwnerName!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  externalInfoUrl!: string | null;

  @ApiProperty({ enum: Object.values(WaterSource), enumName: 'WaterSource' })
  source!: WaterSource;

  @ApiProperty({ format: 'date-time', description: 'Last change of the catalogue entry' })
  updatedAt!: string;
}

/** A water of the organization admin's own list (`GET /orgs/:orgId/waters`). */
export class OrgWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;

  @ApiProperty(type)
  type!: WaterType;

  @ApiProperty({ example: 'mazowieckie' })
  region!: string;
}
