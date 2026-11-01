import {
  CATCH_SEASONS,
  EffectivePermitStatus,
  INSPECTION_NOTES_MAX_LENGTH,
  InspectionResult,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CatchDto } from '../../catches/dto/catch.dto';
import { PermitOrganizationDto, PermitWaterDto } from '../../permits/dto/permit.dto';
import { IfPresent } from '../../users/dto/profile.dto';

const nullable = { nullable: true, required: false };
const resultApi = { enum: Object.values(InspectionResult), enumName: 'InspectionResult' };

export class VerifiedPermitTypeDto {
  @ApiProperty({ example: 'Dzienne' })
  name!: string;
}

/** What anyone with the QR code sees of a permit (FR-28): no personal data but the initials. */
export class VerifiedPermitDto {
  @ApiProperty({
    enum: Object.values(EffectivePermitStatus),
    enumName: 'EffectivePermitStatus',
    description: 'Computed now (ADR-0005); only ACTIVE is valid',
  })
  status!: EffectivePermitStatus;

  @ApiProperty({ format: 'date', example: '2026-10-06' })
  validFrom!: string;

  @ApiProperty({ format: 'date', example: '2026-10-06', description: 'Last valid day, inclusive' })
  validTo!: string;

  @ApiProperty({ type: VerifiedPermitTypeDto })
  permitType!: VerifiedPermitTypeDto;

  @ApiProperty({ type: PermitOrganizationDto, description: 'The issuer, owner of the type' })
  organization!: PermitOrganizationDto;

  @ApiProperty({
    type: [PermitWaterDto],
    description: 'Waters of the permit type, which the permit covers (BR-01); by name',
  })
  waters!: PermitWaterDto[];

  @ApiProperty({ example: 'J. K.', description: 'Initials of the holder' })
  holderInitials!: string;
}

export class PermitHolderDto {
  @ApiProperty({ example: 'Jan' })
  firstName!: string;

  @ApiProperty({ example: 'Kowalski' })
  lastName!: string;

  @ApiProperty({ example: 1990, description: 'To compare with an identity document' })
  birthYear!: number;
}

/** What an inspector or admin of the issuing organization sees in addition (FR-17). */
export class InspectionViewDto {
  @ApiProperty({ format: 'uuid', description: 'For the protocol' })
  permitId!: string;

  @ApiProperty({ example: 'ZW-2026-000123' })
  number!: string;

  @ApiProperty({ type: PermitHolderDto })
  holder!: PermitHolderDto;

  @ApiProperty({
    type: [CatchDto],
    description:
      'Catches recorded on this permit today (Europe/Warsaw), accepted and rejected, latest first',
  })
  catchesToday!: CatchDto[];
}

export class VerificationDto {
  @ApiProperty({ description: 'The token is genuine and the permit is ACTIVE now' })
  valid!: boolean;

  @ApiProperty({
    type: VerifiedPermitDto,
    nullable: true,
    description: 'null: the token is forged, malformed or expired, or names no permit',
  })
  permit!: VerifiedPermitDto | null;

  @ApiProperty({
    type: InspectionViewDto,
    nullable: true,
    description: 'Only for an INSPECTOR or ORG_ADMIN of the issuing ACTIVE organization',
  })
  inspection!: InspectionViewDto | null;
}

/** Either both coordinates or neither. */
const hasPosition = (dto: CreateInspectionDto): boolean =>
  (dto.lat ?? null) !== null || (dto.lng ?? null) !== null;

/** Blank notes are no notes. */
const notesOf = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateInspectionDto {
  @ApiProperty({ format: 'uuid', description: 'inspection.permitId of the check' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  permitId!: string;

  @ApiProperty(resultApi)
  @IsEnum(InspectionResult)
  result!: InspectionResult;

  @ApiPropertyOptional({ ...nullable, type: String, maxLength: INSPECTION_NOTES_MAX_LENGTH })
  @Transform(notesOf)
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(INSPECTION_NOTES_MAX_LENGTH)
  notes?: string | null;

  @ApiPropertyOptional({ ...nullable, type: Number, minimum: -90, maximum: 90, example: 52.1 })
  @ValidateIf(hasPosition)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @ApiPropertyOptional({ ...nullable, type: Number, minimum: -180, maximum: 180, example: 21 })
  @ValidateIf(hasPosition)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;
}

export class InspectionsQueryDto {
  @ApiPropertyOptional({
    type: Number,
    example: 2026,
    description: 'Calendar year of performedAt in Europe/Warsaw; the current one by default',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IfPresent()
  @IsInt()
  @Min(CATCH_SEASONS.FIRST)
  @Max(CATCH_SEASONS.LAST)
  season?: number;
}

export class PersonNameDto {
  @ApiProperty({ example: 'Jan' })
  firstName!: string;

  @ApiProperty({ example: 'Kowalski' })
  lastName!: string;
}

export class InspectedPermitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ZW-2026-000123' })
  number!: string;

  @ApiProperty({ type: VerifiedPermitTypeDto })
  permitType!: VerifiedPermitTypeDto;

  @ApiProperty({ type: PersonNameDto, nullable: true, description: 'null: account anonymised' })
  holder!: PersonNameDto | null;
}

export class InspectorDto extends PersonNameDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

/** A saved inspection protocol (FR-18). */
export class InspectionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: InspectedPermitDto })
  permit!: InspectedPermitDto;

  @ApiProperty({ type: InspectorDto, nullable: true, description: 'null: account anonymised' })
  inspector!: InspectorDto | null;

  @ApiProperty({ format: 'date-time' })
  performedAt!: string;

  @ApiProperty(resultApi)
  result!: InspectionResult;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  lat!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  lng!: number | null;
}
