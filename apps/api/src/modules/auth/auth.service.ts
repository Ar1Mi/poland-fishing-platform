import { ErrorCode } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, type User } from '../../generated/prisma/client';
import { MailService } from '../notifications/mail.service';
import { UsersService } from '../users/users.service';
import { AccessTokenService } from './access-token.service';
import type { LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';
import { OneTimeTokenService } from './one-time-token.service';
import { PasswordHasher } from './password-hasher';
import { RefreshTokenService } from './refresh-token.service';

/** Result of login and refresh: the access token for the body, the refresh token for the cookie. */
export interface Session {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly oneTimeTokens: OneTimeTokenService,
    private readonly mail: MailService,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(AuthService.name);
  }

  async register(dto: RegisterDto): Promise<void> {
    // acceptTerms is enforced by the DTO; the account itself is the record of the consent.
    const { email, password, firstName, lastName, birthDate, anglerCardNo, locale } = dto;
    const profile = { email, firstName, lastName, birthDate, anglerCardNo, locale };
    if (await this.users.existsByEmail(profile.email)) {
      throw new DomainError(ErrorCode.EMAIL_TAKEN);
    }
    const passwordHash = await this.passwords.hash(password);
    let created: { user: User; token: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await this.users.create({ ...profile, passwordHash }, tx);
        const token = await this.oneTimeTokens.issue(user.id, 'EMAIL_VERIFICATION', tx);
        return { user, token };
      });
    } catch (error) {
      // Two registrations of one email at once: the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError(ErrorCode.EMAIL_TAKEN);
      }
      throw error;
    }
    await this.mail.sendEmailVerification(created.user, created.token);
  }

  async verifyEmail(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const userId = await this.oneTimeTokens.consume(token, 'EMAIL_VERIFICATION', tx);
      await this.users.markEmailVerified(userId, tx);
    });
  }

  async login({ email, password }: LoginDto): Promise<Session> {
    const user = await this.users.findByEmail(email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verifyAgainstDummy(password);
    if (!user || !valid) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS);
    }
    // Checked after the password, so the answer reveals nothing to someone without it.
    if (!user.emailVerifiedAt) {
      throw new DomainError(ErrorCode.EMAIL_NOT_VERIFIED);
    }
    const { token: refreshToken } = await this.refreshTokens.issue(user.id);
    return { accessToken: await this.accessTokens.sign(user.id), refreshToken };
  }

  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Missing refresh token');
    }
    const result = await this.refreshTokens.rotate(refreshToken);
    if (result.outcome === 'reused') {
      this.logger.warn('Refresh token reuse detected, token family revoked');
    }
    if (result.outcome !== 'rotated' || !(await this.users.findById(result.userId))) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Invalid refresh token');
    }
    return {
      accessToken: await this.accessTokens.sign(result.userId),
      refreshToken: result.token,
    };
  }

  async logout(userId: string, refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.refreshTokens.revokeFamilyOf(refreshToken, userId);
    }
  }

  /** Same response whether or not the account exists (no email enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      return;
    }
    const token = await this.oneTimeTokens.issue(user.id, 'PASSWORD_RESET');
    // Not awaited: waiting for SMTP only for existing accounts would reveal them by timing.
    void this.mail.sendPasswordReset(user, token);
  }

  /** The link proves the mailbox: it also confirms the email; all devices are logged out. */
  async resetPassword({ token, password }: ResetPasswordDto): Promise<void> {
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const userId = await this.oneTimeTokens.consume(token, 'PASSWORD_RESET', tx);
      await this.users.setPasswordHash(userId, passwordHash, tx);
      await this.users.markEmailVerified(userId, tx);
      await this.refreshTokens.revokeAllForUser(userId, tx);
    });
  }
}
