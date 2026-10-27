import {
  DiscountKind,
  LOWEST_PRICES_MAX_WATERS,
  PERMIT_DURATION_MAX_DAYS,
  PERMIT_PRICE_MAX_GROSZE,
  PERMIT_TYPE_MAX_WATERS,
  PERMIT_TYPE_NAME_MAX_LENGTH,
} from '@lowisko/shared';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IfPresent, trim } from '../../users/dto/profile.dto';

const discountKind = { enum: Object.values(DiscountKind), enumName: 'DiscountKind' };

// Each field's rules once, for the create body and the partial update.
const field = {
  name: {
    api: { maxLength: PERMIT_TYPE_NAME_MAX_LENGTH, example: 'Dzienne' },
    rules: () =>
      applyDecorators(
        Transform(trim),
        IsString(),
        IsNotEmpty(),
        MaxLength(PERMIT_TYPE_NAME_MAX_LENGTH),
      ),
  },
  durationDays: {
    api: { minimum: 1, maximum: PERMIT_DURATION_MAX_DAYS, example: 1 },
    rules: () => applyDecorators(IsInt(), Min(1), Max(PERMIT_DURATION_MAX_DAYS)),
  },
  priceGrosze: {
    api: {
      minimum: 0,
      maximum: PERMIT_PRICE_MAX_GROSZE,
      example: 2500,
      description: 'Whole grosze; 0 is a free permit',
    },
    rules: () => applyDecorators(IsInt(), Min(0), Max(PERMIT_PRICE_MAX_GROSZE)),
  },
  discountKind: {
    api: discountKind,
    rules: () => IsEnum(DiscountKind),
  },
  waterIds: {
    api: {
      type: String,
      format: 'uuid',
      isArray: true,
      minItems: 1,
      maxItems: PERMIT_TYPE_MAX_WATERS,
      description: 'Waters connected to the organization that the permit covers',
    },
    rules: () =>
      applyDecorators(
        IsArray(),
        ArrayMinSize(1),
        ArrayMaxSize(PERMIT_TYPE_MAX_WATERS),
        ArrayUnique(),
        IsUUID('all', { each: true }),
      ),
  },
};

export class CreatePermitTypeDto {
  @ApiProperty(field.name.api)
  @field.name.rules()
  name!: string;

  @ApiProperty(field.durationDays.api)
  @field.durationDays.rules()
  durationDays!: number;

  @ApiProperty(field.priceGrosze.api)
  @field.priceGrosze.rules()
  priceGrosze!: number;

  @ApiProperty(field.discountKind.api)
  @field.discountKind.rules()
  discountKind!: DiscountKind;

  @ApiProperty(field.waterIds.api)
  @field.waterIds.rules()
  waterIds!: string[];
}

/**
 * Any subset of the fields; a field sent as `null` is invalid (not «leave it»). Once the type
 * has permits, `durationDays`, `discountKind` and `waterIds` may only be sent unchanged
 * (PERMIT_TYPE_LOCKED_FIELDS).
 */
export class UpdatePermitTypeDto {
  @ApiPropertyOptional(field.name.api)
  @IfPresent()
  @field.name.rules()
  name?: string;

  @ApiPropertyOptional(field.durationDays.api)
  @IfPresent()
  @field.durationDays.rules()
  durationDays?: number;

  @ApiPropertyOptional(field.priceGrosze.api)
  @IfPresent()
  @field.priceGrosze.rules()
  priceGrosze?: number;

  @ApiPropertyOptional(field.discountKind.api)
  @IfPresent()
  @field.discountKind.rules()
  discountKind?: DiscountKind;

  @ApiPropertyOptional(field.waterIds.api)
  @IfPresent()
  @field.waterIds.rules()
  waterIds?: string[];

  @ApiPropertyOptional({ description: 'false stops the sale; the type stays on sold permits' })
  @IfPresent()
  @IsBoolean()
  isActive?: boolean;
}

export class ListPermitTypesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  waterId!: string;
}

export class LowestPricesQueryDto {
  @ApiProperty({
    type: String,
    example: '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f,7e8f9a0b-1c2d-4e3f-8a5b-6c7d8e9f0a1b',
    description: `Comma-separated water ids, at most ${LOWEST_PRICES_MAX_WATERS}`,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LOWEST_PRICES_MAX_WATERS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  waterIds!: string[];
}

/** What an angler sees of a permit type on the water card. */
export class PermitTypeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Dzienne' })
  name!: string;

  @ApiProperty({ example: 1 })
  durationDays!: number;

  @ApiProperty({ example: 2500, description: 'Whole grosze' })
  priceGrosze!: number;

  @ApiProperty(discountKind)
  discountKind!: DiscountKind;
}

export class PermitTypeWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;
}

/** A permit type as its organization manages it. */
export class OrgPermitTypeDto extends PermitTypeDto {
  @ApiProperty({ description: 'false: not sold any more' })
  isActive!: boolean;

  @ApiProperty({
    description:
      'Permits of this type exist: durationDays, discountKind and waters are fixed, ' +
      'and the type cannot be deleted (only deactivated)',
  })
  inUse!: boolean;

  @ApiProperty({ type: PermitTypeWaterDto, isArray: true, description: 'Sorted by name' })
  waters!: PermitTypeWaterDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class LowestPriceDto {
  @ApiProperty({ format: 'uuid' })
  waterId!: string;

  @ApiProperty({
    example: 2500,
    description: 'Lowest price of an active regular (not discounted) type, whole grosze',
  })
  priceGrosze!: number;
}
