import {
  CLAIM_COMMENT_MAX_LENGTH,
  ClaimDecision,
  ClaimStatus,
  OrganizationStatus,
  WaterStatus,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { trim } from '../../users/dto/profile.dto';

const claimStatus = { enum: Object.values(ClaimStatus), enumName: 'ClaimStatus' };

/** Text fields of the multipart claim form; the document is the `file` part. */
export class CreateClaimDto {
  @ApiProperty({ format: 'uuid', description: 'Catalogue water the organization asks for' })
  @IsUUID()
  fishingWaterId!: string;
}

export class ReviewClaimDto {
  @ApiProperty({ enum: Object.values(ClaimDecision), enumName: 'ClaimDecision' })
  @IsEnum(ClaimDecision)
  decision!: ClaimDecision;

  @ApiPropertyOptional({
    maxLength: CLAIM_COMMENT_MAX_LENGTH,
    description: 'Shown to the organization, e.g. why the claim was rejected',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CLAIM_COMMENT_MAX_LENGTH)
  comment?: string;
}

export class ListClaimsQueryDto {
  @ApiPropertyOptional(claimStatus)
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;
}

export class ClaimWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;

  @ApiProperty({ example: 'mazowieckie' })
  region!: string;

  @ApiProperty({ enum: Object.values(WaterStatus), enumName: 'WaterStatus' })
  status!: WaterStatus;
}

/** A claim as its organization sees it. */
export class ClaimDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty(claimStatus)
  status!: ClaimStatus;

  @ApiProperty({ type: ClaimWaterDto })
  water!: ClaimWaterDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Super admin comment; null also when the claim lost to an approved one',
  })
  comment!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: string | null;
}

export class ClaimOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: '5260250274' })
  nip!: string;

  @ApiProperty({ enum: Object.values(OrganizationStatus), enumName: 'OrganizationStatus' })
  status!: OrganizationStatus;
}

/** A claim in the super admin queue: who asks, and the type of the proof document. */
export class AdminClaimDto extends ClaimDto {
  @ApiProperty({ type: ClaimOrganizationDto })
  organization!: ClaimOrganizationDto;

  @ApiProperty({
    example: 'application/pdf',
    description: 'Type of the document at GET /admin/claims/{id}/document',
  })
  documentType!: string;
}
