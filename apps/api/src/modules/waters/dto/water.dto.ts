import {
  type Bbox,
  isRegion,
  parseBbox,
  REGIONS,
  type Region,
  WATER_DESCRIPTION_MAX_LENGTH,
  WATER_QUERY_MAX_LENGTH,
  WATER_SEASON_INFO_MAX_LENGTH,
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
  @ApiProperty({ type: String, nullable: true, description: 'Written by the organization' })
  description!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Fishing season in the words of the organization; catches are not checked by it',
  })
  seasonInfo!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Changes with every new photo: the image is `GET /waters/:id/photo?v=<photoVersion>`; ' +
      'null without a photo',
  })
  photoVersion!: string | null;

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

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      "Last import of the catalogue fields (ADR-0007); null for an angler's suggestion (USER)",
  })
  importedAt!: string | null;
}

/** Blank text clears the field; the DTO turns it into null. */
const blankToNull = ({ value }: { value: unknown }) => {
  const trimmed = trim({ value });
  return trimmed === '' ? null : trimmed;
};

/**
 * `PATCH /orgs/:orgId/waters/:id` (FR-05): a missing field stays, `null` or blank clears it
 * (`@IsOptional` lets null through).
 */
export class UpdateWaterProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: WATER_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(WATER_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: WATER_SEASON_INFO_MAX_LENGTH,
    example: '1 V – 30 IX, 6:00–22:00',
  })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(WATER_SEASON_INFO_MAX_LENGTH)
  seasonInfo?: string | null;
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
