import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../auth/decorators/auth.decorators';
import { ProfileDto, UpdateProfileDto } from './dto/profile.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Profile of the logged-in user' })
  @ApiOkResponse({ type: ProfileDto })
  getProfile(@CurrentUser() user: AuthUser): Promise<ProfileDto> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update name, birth date, angler card number or language' })
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() changes: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.users.updateProfile(user.id, changes);
  }
}
