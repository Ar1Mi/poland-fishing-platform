import {
  isValidNip,
  normalizeNip,
  ORG_NAME_MAX_LENGTH,
  OrganizationKind,
  OrganizationStatus,
  OrgRole,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { trim } from '../../users/dto/profile.dto';

// Limits are shared with the web form (packages/shared/src/orgs/schemas.ts).

const kind = { enum: Object.values(OrganizationKind), enumName: 'OrganizationKind' };
const status = { enum: Object.values(OrganizationStatus), enumName: 'OrganizationStatus' };

export class CreateOrganizationDto {
  @ApiProperty({ maxLength: ORG_NAME_MAX_LENGTH, example: 'Koło PZW nr 12 Warszawa' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ORG_NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({
    example: '5260250274',
    description: 'Separators (spaces, dashes) are dropped; stored as 10 digits.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeNip(value) : value,
  )
  @IsString()
  @ValidateBy({
    name: 'isNip',
    validator: {
      validate: (value) => typeof value === 'string' && isValidNip(value),
      defaultMessage: () => 'nip must be 10 digits with a valid checksum',
    },
  })
  nip!: string;

  @ApiProperty(kind)
  @IsEnum(OrganizationKind)
  kind!: OrganizationKind;

  @ApiProperty({ format: 'email', example: 'kolo12@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  contactEmail!: string;
}

export class OrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: '5260250274' })
  nip!: string;

  @ApiProperty(kind)
  kind!: OrganizationKind;

  @ApiProperty(status)
  status!: OrganizationStatus;

  @ApiProperty({ format: 'email' })
  contactEmail!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class MyOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty(kind)
  kind!: OrganizationKind;

  @ApiProperty(status)
  status!: OrganizationStatus;

  @ApiProperty({ enum: Object.values(OrgRole), enumName: 'OrgRole', isArray: true })
  roles!: OrgRole[];
}

/** PENDING is only the state of a new application; the super admin moves it to one of these. */
export const SETTABLE_STATUSES = [OrganizationStatus.ACTIVE, OrganizationStatus.BLOCKED] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

export class UpdateOrganizationStatusDto {
  @ApiProperty({ enum: SETTABLE_STATUSES, enumName: 'SettableOrganizationStatus' })
  @IsIn(SETTABLE_STATUSES)
  status!: SettableStatus;
}

export class ListOrganizationsQueryDto {
  @ApiPropertyOptional(status)
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}
