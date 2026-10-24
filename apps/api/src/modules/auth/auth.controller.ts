import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { AuthService, type Session } from './auth.service';
import { type AuthUser, CurrentUser, Public } from './decorators/auth.decorators';
import {
  AccessTokenDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/auth.dto';

/** docs/07-security.md: httpOnly, Secure, SameSite=Strict, sent to the auth routes only. */
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};

const error = { type: ErrorResponseDto };

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
// Only the per-IP limit by default; routes below switch on their own (auth-throttlers.ts).
@SkipThrottle({ login: true, email: true })
@ApiTooManyRequestsResponse({ ...error, description: 'RATE_LIMITED' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Create an account and send the email confirmation link' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ ...error, description: 'EMAIL_TAKEN' })
  register(@Body() dto: RegisterDto): Promise<void> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm the email with the token from the link' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'INVALID_TOKEN, VALIDATION_FAILED' })
  @ApiUnauthorizedResponse({ ...error, description: 'TOKEN_EXPIRED' })
  verifyEmail(@Body() { token }: TokenDto): Promise<void> {
    return this.auth.verifyEmail(token);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ login: false })
  @ApiOperation({ summary: 'Log in: access token in the body, refresh token in the `rt` cookie' })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ ...error, description: 'INVALID_CREDENTIALS, EMAIL_NOT_VERIFIED' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    return this.startSession(res, await this.auth.login(dto));
  }

  @Public()
  @Post('refresh')
  // Cheap, authenticated by the cookie, and done by every open tab: no per-IP limit.
  @SkipThrottle({ ip: true })
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED: missing, invalid or reused' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    try {
      return this.startSession(res, await this.auth.refresh(readRefreshCookie(req)));
    } catch (err) {
      // A rejected cookie is useless: drop it so the browser stops sending it.
      res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
      throw err;
    }
  }

  @Post('logout')
  @SkipThrottle({ ip: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Revoke the refresh token family of this device' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.id, readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  }

  @Public()
  @Post('forgot-password')
  @SkipThrottle({ email: false })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Send a password reset link',
    description: 'Answers 204 whether or not an account with the email exists.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  forgotPassword(@Body() { email }: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with the token from the link; logs out all devices',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'INVALID_TOKEN, VALIDATION_FAILED' })
  @ApiUnauthorizedResponse({ ...error, description: 'TOKEN_EXPIRED' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }

  private startSession(res: Response, session: Session): AccessTokenDto {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    return { accessToken: session.accessToken };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
