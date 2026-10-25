import { ANGLER_CARD_NO_MAX_LENGTH, Locale, NAME_MAX_LENGTH } from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` that is a real calendar date (strict ISO 8601 rejects 1990-02-30). */
export function IsDateOnly(): PropertyDecorator {
  return (target, key) => {
    Matches(DATE_ONLY, { message: `${String(key)} must be YYYY-MM-DD` })(target, key);
    IsISO8601({ strict: true })(target, key);
  };
}

/** Required-when-present: `undefined` skips the field, `null` fails validation. */
export const IfPresent = (): PropertyDecorator => ValidateIf((_, value) => value !== undefined);

export class ProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ format: 'date', example: '1990-05-01' })
  birthDate!: string;

  @ApiProperty({ type: String, nullable: true })
  anglerCardNo!: string | null;

  @ApiProperty({ enum: Object.values(Locale), enumName: 'Locale' })
  locale!: Locale;

  @ApiProperty()
  isSuperAdmin!: boolean;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IfPresent()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IfPresent()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  lastName?: string;

  @ApiPropertyOptional({ format: 'date', example: '1990-05-01' })
  @IfPresent()
  @IsDateOnly()
  birthDate?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ANGLER_CARD_NO_MAX_LENGTH,
    description: '`null` or an empty string removes the card number.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(ANGLER_CARD_NO_MAX_LENGTH)
  anglerCardNo?: string | null;

  @ApiPropertyOptional({ enum: Object.values(Locale), enumName: 'Locale' })
  @IfPresent()
  @IsEnum(Locale)
  locale?: Locale;
}
