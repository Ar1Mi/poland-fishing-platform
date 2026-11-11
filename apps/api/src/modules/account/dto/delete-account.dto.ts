import { PASSWORD_MAX_LENGTH } from '@lowisko/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** `DELETE /me`: the current password confirms that the user deletes their own account. */
export class DeleteAccountDto {
  @ApiProperty({ maxLength: PASSWORD_MAX_LENGTH, description: 'The current password' })
  @IsString()
  // Any length a login accepts: a password set under older limits must still confirm.
  @Length(1, PASSWORD_MAX_LENGTH)
  password!: string;
}
