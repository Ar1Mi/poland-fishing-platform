import { ErrorCode } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import type { OneTimeTokenPurpose } from '../../generated/prisma/client';
import type { Db } from '../users/users.service';
import { EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS } from './auth.constants';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';

const TTL_MS: Readonly<Record<OneTimeTokenPurpose, number>> = {
  EMAIL_VERIFICATION: EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET: PASSWORD_RESET_TTL_MS,
};

/** Email-link tokens (verification, password reset): single use, short-lived, stored hashed. */
@Injectable()
export class OneTimeTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** A new link invalidates the unused ones of the same purpose: only the latest email works. */
  async issue(userId: string, purpose: OneTimeTokenPurpose, db: Db = this.prisma): Promise<string> {
    const token = generateOpaqueToken();
    const now = this.clock.now();
    await db.oneTimeToken.deleteMany({ where: { userId, purpose, usedAt: null } });
    await db.oneTimeToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + TTL_MS[purpose]),
      },
    });
    return token;
  }

  /**
   * Marks the token used and returns its user. INVALID_TOKEN: unknown, of another purpose or
   * already used; TOKEN_EXPIRED: the link is too old (the UI offers to request a new one).
   */
  async consume(
    token: string,
    purpose: OneTimeTokenPurpose,
    db: Db = this.prisma,
  ): Promise<string> {
    const now = this.clock.now();
    const tokenHash = hashOpaqueToken(token);
    // Conditional update: a link clicked twice at once is consumed only once.
    const { count } = await db.oneTimeToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    const row = await db.oneTimeToken.findUnique({ where: { tokenHash } });
    if (count === 1 && row) {
      return row.userId;
    }
    if (row && row.purpose === purpose && !row.usedAt && row.expiresAt <= now) {
      throw new DomainError(ErrorCode.TOKEN_EXPIRED, undefined, 'Link expired');
    }
    throw new DomainError(ErrorCode.INVALID_TOKEN, undefined, 'Invalid or used link');
  }
}
