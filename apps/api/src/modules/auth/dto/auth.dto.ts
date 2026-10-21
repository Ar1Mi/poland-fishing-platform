import {
  ANGLER_CARD_NO_MAX_LENGTH,
  Locale,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsDateOnly, trim } from '../../users/dto/profile.dto';

// Limits are shared with the web forms (packages/shared/src/auth/schemas.ts).

const Email = (): PropertyDecorator => (target, key) => {
  ApiProperty({ format: 'email', example: 'jan.kowalski@example.com' })(target, key);
  Transform(trim)(target, key);
  IsEmail()(target, key);
  MaxLength(254)(target, key);
};

const NewPassword = (): PropertyDecorator => (target, key) => {
  ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })(target, key);
  IsString()(target, key);
  Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)(target, key);
};

const Name = (): PropertyDecorator => (target, key) => {
  ApiProperty({ maxLength: NAME_MAX_LENGTH })(target, key);
  Transform(trim)(target, key);
  IsString()(target, key);
  IsNotEmpty()(target, key);
  MaxLength(NAME_MAX_LENGTH)(target, key);
};

export class RegisterDto {
  @Email()
  email!: string;

  @NewPassword()
  password!: string;

  @Name()
  firstName!: string;

  @Name()
  lastName!: string;

  @ApiProperty({ format: 'date', example: '1990-05-01' })
  @IsDateOnly()
  birthDate!: string;

  @ApiPropertyOptional({ maxLength: ANGLER_CARD_NO_MAX_LENGTH })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(ANGLER_CARD_NO_MAX_LENGTH)
  anglerCardNo?: string;

  @ApiPropertyOptional({
    enum: Object.values(Locale),
    enumName: 'Locale',
    description: 'Defaults to pl.',
  })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @ApiProperty({ enum: [true], description: 'Consent to the privacy policy (RODO).' })
  @Equals(true)
  acceptTerms!: true;
}

export class LoginDto {
  @Email()
  email!: string;

  @ApiProperty({ maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password!: string;
}

export class TokenDto {
  @ApiProperty({ description: 'Token from the email link.' })
  @IsString()
  @Length(1, 256)
  token!: string;
}

export class ForgotPasswordDto {
  @Email()
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @NewPassword()
  password!: string;
}

export class AccessTokenDto {
  @ApiProperty({ description: 'Access JWT, valid for 15 minutes; keep it in memory only.' })
  accessToken!: string;
}
