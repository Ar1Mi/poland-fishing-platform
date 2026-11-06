import {
  EffectivePermitStatus,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  REVOKE_REASON_MAX_LENGTH,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { IfPresent, trim } from '../../users/dto/profile.dto';

/** The statuses of a sold permit (paid, then maybe revoked): what the list filters by. */
export const SOLD_PERMIT_STATUSES = [
  EffectivePermitStatus.SCHEDULED,
  EffectivePermitStatus.ACTIVE,
  EffectivePermitStatus.EXPIRED,
  EffectivePermitStatus.REVOKED,
] as const;
export type SoldPermitStatus = (typeof SOLD_PERMIT_STATUSES)[number];

/** A permit number fragment: `ZW-2026-000123` has 14 characters, 7-digit numbers one more. */
export const PERMIT_NUMBER_QUERY_MAX_LENGTH = 20;

const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class ListOrgPermitsQueryDto {
  @ApiPropertyOptional({ enum: SOLD_PERMIT_STATUSES, enumName: 'SoldPermitStatus' })
  @IfPresent()
  @IsIn(SOLD_PERMIT_STATUSES)
  status?: SoldPermitStatus;

  @ApiPropertyOptional({
    maxLength: PERMIT_NUMBER_QUERY_MAX_LENGTH,
    description: 'Part of the permit number, case-insensitive',
  })
  @IfPresent()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PERMIT_NUMBER_QUERY_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @Transform(integer)
  @IfPresent()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: PAGE_SIZE_MAX,
    default: PAGE_SIZE_DEFAULT,
  })
  @Transform(integer)
  @IfPresent()
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  pageSize?: number;
}

export class PermitHolderDto {
  @ApiProperty({ example: 'Jan' })
  firstName!: string;

  @ApiProperty({ example: 'Kowalski' })
  lastName!: string;
}

export class OrgPermitTypeRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Dzienne' })
  name!: string;
}

/** A permit sold by the organization, as its admin sees it (FR-10). */
export class OrgPermitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ZW-2026-000123' })
  number!: string;

  @ApiProperty({ enum: SOLD_PERMIT_STATUSES, enumName: 'SoldPermitStatus' })
  status!: SoldPermitStatus;

  @ApiProperty({ format: 'date', example: '2026-10-06' })
  validFrom!: string;

  @ApiProperty({ format: 'date', example: '2026-10-06', description: 'Last valid day, inclusive' })
  validTo!: string;

  @ApiProperty({ example: 2500, description: 'Whole grosze' })
  pricePaidGrosze!: number;

  @ApiProperty({ type: OrgPermitTypeRefDto })
  permitType!: OrgPermitTypeRefDto;

  @ApiProperty({
    type: PermitHolderDto,
    nullable: true,
    description: 'null: the account was anonymised',
  })
  holder!: PermitHolderDto | null;

  @ApiProperty({ format: 'date-time', description: 'Purchase' })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  revokeReason!: string | null;
}

export class OrgPermitPageDto {
  @ApiProperty({ type: OrgPermitDto, isArray: true, description: 'Latest purchase first' })
  items!: OrgPermitDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class RevokePermitDto {
  @ApiProperty({
    maxLength: REVOKE_REASON_MAX_LENGTH,
    example: 'Rezygnacja przed rozpoczęciem; zwrot przelewem 12.05',
    description: 'Required; a refund, made outside the platform, is noted here',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(REVOKE_REASON_MAX_LENGTH)
  reason!: string;
}
