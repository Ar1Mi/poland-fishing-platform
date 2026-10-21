import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service';
import { lockUserTokens, RefreshTokenService } from '../src/modules/auth/refresh-token.service';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createUser } from './factories';

// A deterministic version of "a thief refreshes while the victim resets the password":
// the rotation's transaction is held open while the revocation waits for its row lock.
describe('RefreshTokenService revocation during a rotation', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('also revokes the successor a concurrent rotation inserted', async () => {
    const user = await createUser(prisma);
    const tokens = app.get(RefreshTokenService);
    const familyId = crypto.randomUUID();
    const current = await db.prisma.refreshToken.create({
      data: { userId: user.id, familyId, tokenHash: 'current', expiresAt: new Date('2027-01-01') },
    });
    let revocation: Promise<void> | undefined;

    // The same steps as RefreshTokenService.rotate, on a separate connection.
    await db.prisma.$transaction(async (tx) => {
      await lockUserTokens(tx, user.id);
      await tx.refreshToken.update({ where: { id: current.id }, data: { revokedAt: FIXED_NOW } });
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: 'successor',
          expiresAt: new Date('2027-01-08'),
        },
      });
      revocation = tokens.revokeAllForUser(user.id);
      // Let the revocation start and wait for the lock.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await revocation;

    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });
});
