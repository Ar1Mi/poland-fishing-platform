import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS } from '../auth/auth.constants';
import { type AuthUser, CurrentUser } from '../auth/decorators/auth.decorators';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

const error = { type: ErrorResponseDto };

/** RODO rights of the logged-in user (T-26, ADR-0016); the profile itself is UsersController. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('export')
  // Everything about the user, fetched with a token: no copy in browser or proxy caches.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'RODO: all data of the user as one JSON file',
    description:
      'Profile, organizations and roles, invitations to the address, permits with payments ' +
      '(no QR token), external permits (photos separately), catches of every season with ' +
      'positions, protocols of inspections of the permits, login sessions, own audit entries.',
  })
  @ApiProduces('application/json')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
  async export(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const { fileName, content } = await this.account.export(user.id);
    return new StreamableFile(content, {
      type: 'application/json; charset=utf-8',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ ip: true, login: true, email: true })
  @ApiOperation({
    summary: 'RODO: delete the account (anonymise), confirmed by the password',
    description:
      'Personal fields get placeholders; sessions, memberships and pending invitations go; ' +
      'catches stay without positions, permits with a masked owner, external permits without ' +
      'number and photo. The last admin of an ACTIVE organization hands the role over first.',
  })
  @ApiNoContentResponse({ description: 'Deleted; the refresh cookie is cleared' })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiUnauthorizedResponse({
    ...error,
    description: 'INVALID_CREDENTIALS (wrong password), UNAUTHENTICATED, TOKEN_EXPIRED',
  })
  @ApiConflictResponse({ ...error, description: 'LAST_ORG_ADMIN (details.organizationIds)' })
  @ApiTooManyRequestsResponse({ ...error, description: 'RATE_LIMITED' })
  async delete(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.delete(user.id, dto.password);
    // The browser's refresh cookie is useless now (its token is gone): drop it.
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  }
}
