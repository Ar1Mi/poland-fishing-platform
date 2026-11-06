import {
  EXTERNAL_PERMIT_ISSUER_MAX_LENGTH,
  EXTERNAL_PERMIT_MAX_DAYS,
  EXTERNAL_PERMIT_MAX_WATERS,
  EXTERNAL_PERMIT_NUMBER_MAX_LENGTH,
  EXTERNAL_PERMIT_PHOTO_MIME_TYPES,
  EffectivePermitStatus,
  type ExternalPermitStatus,
} from '@lowisko/shared';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IfPresent, IsDateOnly, trim } from '../../users/dto/profile.dto';
import { OfflineWaterRulesDto, PermitWaterDto } from './permit.dto';

const DATES =
  `Both days inclusive, at most ${EXTERNAL_PERMIT_MAX_DAYS} days, in the seasons 2000–2100; ` +
  'the start may be in the past, but not more than 365 days ahead';

// Each field's rules once, for the create body and the partial update.
const field = {
  issuerName: {
    api: {
      maxLength: EXTERNAL_PERMIT_ISSUER_MAX_LENGTH,
      example: 'Gospodarstwo Rybackie Wąsosze',
      description: 'Who issued the permit: the użytkownik rybacki or the shop',
    },
    rules: () =>
      applyDecorators(
        Transform(trim),
        IsString(),
        IsNotEmpty(),
        MaxLength(EXTERNAL_PERMIT_ISSUER_MAX_LENGTH),
      ),
  },
  number: {
    api: {
      type: String,
      nullable: true,
      maxLength: EXTERNAL_PERMIT_NUMBER_MAX_LENGTH,
      example: '123/2026',
      description: '`null` or an empty string: the permit has no number',
    },
    rules: () =>
      applyDecorators(
        IsOptional(),
        Transform(trim),
        IsString(),
        MaxLength(EXTERNAL_PERMIT_NUMBER_MAX_LENGTH),
      ),
  },
  validFrom: {
    api: { format: 'date', example: '2026-05-01', description: `First valid day. ${DATES}` },
    rules: () => IsDateOnly(),
  },
  validTo: {
    api: { format: 'date', example: '2026-12-31', description: `Last valid day. ${DATES}` },
    rules: () => IsDateOnly(),
  },
  waterIds: {
    api: {
      type: String,
      format: 'uuid',
      isArray: true,
      minItems: 1,
      maxItems: EXTERNAL_PERMIT_MAX_WATERS,
      description:
        'Catalogue waters the permit covers (BR-01); any status — the catches on them are ' +
        'checked against the general rules only',
    },
    rules: () =>
      applyDecorators(
        // As the UUIDs of a catch (T-18): a water in capitals is the same water.
        Transform(({ value }: { value: unknown }) =>
          Array.isArray(value)
            ? value.map((id: unknown) => (typeof id === 'string' ? id.toLowerCase() : id))
            : value,
        ),
        IsArray(),
        ArrayMinSize(1),
        ArrayMaxSize(EXTERNAL_PERMIT_MAX_WATERS),
        ArrayUnique(),
        IsUUID('all', { each: true }),
      ),
  },
};

export class CreateExternalPermitDto {
  @ApiProperty(field.issuerName.api)
  @field.issuerName.rules()
  issuerName!: string;

  @ApiPropertyOptional(field.number.api)
  @field.number.rules()
  number?: string | null;

  @ApiProperty(field.validFrom.api)
  @field.validFrom.rules()
  validFrom!: string;

  @ApiProperty(field.validTo.api)
  @field.validTo.rules()
  validTo!: string;

  @ApiProperty(field.waterIds.api)
  @field.waterIds.rules()
  waterIds!: string[];
}

/**
 * Any subset of the fields; `number: null` removes the number, other fields sent as `null` are
 * invalid. Catches already recorded are not checked again (docs/02-business-rules.md).
 */
export class UpdateExternalPermitDto {
  @ApiPropertyOptional(field.issuerName.api)
  @IfPresent()
  @field.issuerName.rules()
  issuerName?: string;

  @ApiPropertyOptional(field.number.api)
  @field.number.rules()
  number?: string | null;

  @ApiPropertyOptional(field.validFrom.api)
  @IfPresent()
  @field.validFrom.rules()
  validFrom?: string;

  @ApiPropertyOptional(field.validTo.api)
  @IfPresent()
  @field.validTo.rules()
  validTo?: string;

  @ApiPropertyOptional(field.waterIds.api)
  @IfPresent()
  @field.waterIds.rules()
  waterIds?: string[];
}

const EXTERNAL_STATUSES: ExternalPermitStatus[] = [
  EffectivePermitStatus.SCHEDULED,
  EffectivePermitStatus.ACTIVE,
  EffectivePermitStatus.EXPIRED,
];

/** An external permit as its owner sees it (FR-26). */
export class ExternalPermitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Gospodarstwo Rybackie Wąsosze' })
  issuerName!: string;

  @ApiProperty({ type: String, nullable: true, example: '123/2026' })
  number!: string | null;

  @ApiProperty({
    enum: EXTERNAL_STATUSES,
    enumName: 'ExternalPermitStatus',
    description: 'From the dates by the Warsaw day: an external permit has no stored status',
  })
  status!: ExternalPermitStatus;

  @ApiProperty({ format: 'date', example: '2026-05-01' })
  validFrom!: string;

  @ApiProperty({ format: 'date', example: '2026-12-31', description: 'Last valid day, inclusive' })
  validTo!: string;

  @ApiProperty({ type: [PermitWaterDto], description: 'Waters the permit covers, by name' })
  waters!: PermitWaterDto[];

  @ApiProperty({
    type: String,
    enum: [...EXTERNAL_PERMIT_PHOTO_MIME_TYPES],
    nullable: true,
    description: 'Type of the photo or scan (`GET …/photo`); null without one',
  })
  photoType!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** What the PWA stores to record catches on an external permit without network (T-22). */
export class ExternalOfflineBundleDto {
  @ApiProperty({ type: ExternalPermitDto })
  permit!: ExternalPermitDto;

  @ApiProperty({
    type: [OfflineWaterRulesDto],
    description:
      'One per water of the permit, in the order of permit.waters; the general rules on each',
  })
  waterRules!: OfflineWaterRulesDto[];
}
