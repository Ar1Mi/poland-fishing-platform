import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClockService } from '../../common/clock/clock.service';
import { PrismaService } from '../../database/prisma.service';
import type { Db } from '../users/users.service';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';

export interface IssuedRefreshToken {
  token: string;
  userId: string;
}

export type RotationResult =
  | ({ outcome: 'rotated' } & IssuedRefreshToken)
  /** Unknown or expired. */
  | { outcome: 'invalid' }
  /** A revoked token came back: a stolen older copy, or a race of two refreshes. */
  | { outcome: 'reused'; userId: string; familyId: string };

/**
 * Serialises rotations and revocations of one user's tokens until the transaction ends.
 * Without it a revocation waiting for a rotation's row lock re-checks only the rows it saw
 * at its start (READ COMMITTED) and misses the successor that rotation inserted: a thief
 * refreshing at the moment of a password reset would keep a working token. An advisory lock
 * keyed by the user id needs no row of another module's table.
 */
export async function lockUserTokens(db: Db, userId: string): Promise<void> {
  await db.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
}

/**
 * Refresh tokens with rotation (docs/07-security.md): every refresh replaces the token by a
 * new one of the same family; presenting a replaced token revokes the whole family, so a
 * thief and the victim are both logged out and the victim notices.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Starts a new family (a login on one device). */
  issue(userId: string): Promise<IssuedRefreshToken> {
    return this.create(this.prisma, userId, randomUUID());
  }

  async rotate(token: string): Promise<RotationResult> {
    const now = this.clock.now();
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!current) {
      return { outcome: 'invalid' };
    }
    const { userId, familyId } = current;
    if (current.revokedAt) {
      // Revoking again is harmless when logout already revoked the family.
      await this.revoke(userId, { familyId });
      return { outcome: 'reused', userId, familyId };
    }
    if (current.expiresAt <= now) {
      return { outcome: 'invalid' };
    }

    return this.prisma.$transaction(async (tx) => {
      await lockUserTokens(tx, userId);
      // Conditional update: of two concurrent rotations of one token only one wins.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (count === 0) {
        await this.revoke(userId, { familyId }, tx);
        return { outcome: 'reused', userId, familyId } as const;
      }
      const next = await this.create(tx, userId, familyId);
      return { outcome: 'rotated', ...next } as const;
    });
  }

  /** Logout of one device. */
  async revokeFamilyOf(token: string, userId: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    // A cookie of another account (shared browser) is not this user's to revoke.
    if (current?.userId === userId) {
      await this.revoke(userId, { familyId: current.familyId });
    }
  }

  /** Password reset: every device has to log in again. */
  revokeAllForUser(userId: string, db?: Db): Promise<void> {
    return this.revoke(userId, {}, db);
  }

  /** Runs in `db` (the caller's transaction) or in a transaction of its own. */
  private async revoke(userId: string, where: { familyId?: string }, db?: Db): Promise<void> {
    const run = async (tx: Db): Promise<void> => {
      await lockUserTokens(tx, userId);
      await tx.refreshToken.updateMany({
        where: { userId, ...where, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      });
    };
    await (db ? run(db) : this.prisma.$transaction(run));
  }

  private async create(db: Db, userId: string, familyId: string): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const now = this.clock.now();
    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashOpaqueToken(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { token, userId };
  }
}
