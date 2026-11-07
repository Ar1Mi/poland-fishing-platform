import { INVITATION_EMAIL_MAX_LENGTH, OrgRole } from '@lowisko/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { trim } from '../../users/dto/profile.dto';

// Members and invitations (FR-04). Limits are shared with the web forms
// (packages/shared/src/orgs/members.ts).

const role = { enum: Object.values(OrgRole), enumName: 'OrgRole' };

export class MemberDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ type: String, nullable: true, description: 'null: the account was anonymised' })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'email' })
  email!: string | null;

  @ApiProperty({ ...role, isArray: true, description: 'Every role held in this organization' })
  roles!: OrgRole[];

  @ApiProperty({ format: 'date-time', description: 'When the first of the roles was given' })
  since!: string;
}

export class UpdateMemberRolesDto {
  @ApiProperty({ ...role, isArray: true, minItems: 1, description: 'Every role the member keeps' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(OrgRole, { each: true })
  roles!: OrgRole[];
}

export class CreateInvitationDto {
  @ApiProperty({ format: 'email', maxLength: INVITATION_EMAIL_MAX_LENGTH })
  @Transform(trim)
  @IsEmail()
  @MaxLength(INVITATION_EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty(role)
  @IsEnum(OrgRole)
  role!: OrgRole;
}

export class InvitationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', description: 'In lower case' })
  email!: string;

  @ApiProperty(role)
  role!: OrgRole;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ description: 'The link no longer works: invite again for a new one' })
  expired!: boolean;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'The token from the link in the email' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token!: string;
}

export class InvitedOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class AcceptedInvitationDto {
  @ApiProperty({ type: InvitedOrganizationDto })
  organization!: InvitedOrganizationDto;

  @ApiProperty(role)
  role!: OrgRole;
}
