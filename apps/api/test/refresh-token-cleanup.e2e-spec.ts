import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { REFRESH_TOKEN_RETENTION_DAYS } from '../src/modules/auth/auth.constants';
import { RefreshTokenCleanupJob } from '../src/modules/auth/refresh-token-cleanup.job';
import { createVerifiedUser, login, refreshCookie } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createUser } from './factories';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(FIXED_NOW.getTime() - days * DAY_MS);

describe('RefreshTokenCleanupJob (T-26)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let now: Date;

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = FIXED_NOW;
    app = await createTestApp({ prisma, now: () => now });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  const token = (userId: string, tokenHash: string, expiresAt: Date, revokedAt?: Date) =>
    prisma.refreshToken.create({
      data: { userId, familyId: crypto.randomUUID(), tokenHash, expiresAt, revokedAt },
    });

  it(`deletes tokens expired more than ${REFRESH_TOKEN_RETENTION_DAYS} days ago, revoked or not`, async () => {
    const { id: userId } = await createUser(prisma);
    const retention = REFRESH_TOKEN_RETENTION_DAYS;
    await token(userId, 'long-expired', daysAgo(retention + 1));
    await token(userId, 'long-expired-revoked', daysAgo(retention + 1), daysAgo(retention + 5));
    await token(userId, 'expired-within-retention', daysAgo(retention - 1));
    // Revoked but not expired: still reveals a stolen copy if it comes back.
    await token(userId, 'revoked-valid', new Date(FIXED_NOW.getTime() + DAY_MS), daysAgo(1));
    await token(userId, 'valid', new Date(FIXED_NOW.getTime() + DAY_MS));
    // Exactly at the edge: kept until the next night.
    await token(userId, 'at-the-edge', daysAgo(retention));

    await app.get(RefreshTokenCleanupJob).run();

    const left = await prisma.refreshToken.findMany({ select: { tokenHash: true } });
    expect(left.map((row) => row.tokenHash).sort()).toEqual([
      'at-the-edge',
      'expired-within-retention',
      'revoked-valid',
      'valid',
    ]);
  });

  it('keeps reuse detection working for a revoked token that has not expired', async () => {
    const user = await createVerifiedUser(prisma);
    const { cookie } = await login(app, user.email);
    const refresh = (value: string) =>
      request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', value);
    const rotated = refreshCookie(await refresh(cookie).expect(200))!;
    now = new Date(FIXED_NOW.getTime() + 6 * DAY_MS);

    await app.get(RefreshTokenCleanupJob).run();
    // The replaced cookie comes back: the whole family is revoked, the current token too.
    await refresh(cookie).expect(401);

    await refresh(rotated).expect(401);
  });
});
