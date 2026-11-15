import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createExternalPermit,
  createPermit,
  createSpecies,
  createUser,
  createWater,
} from './factories';

interface MyStats {
  season: number;
  from: string;
  to: string;
  catches: {
    count: number;
    keptCount: number;
    releasedCount: number;
    bySpecies: { speciesId: string; count: number; keptCount: number }[];
    byWater: { water: { id: string; name: string }; count: number; keptCount: number }[];
  };
}

// FIXED_NOW is 2026-10-06 17:20 in Warsaw: the default season is 2026.
describe('GET /me/stats (FR-20)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let angler: { id: string; accessToken: string };
  let permitId: string;
  let externalPermitId: string;
  let zegrzeId: string;
  let narewId: string;
  let pikeId: string;
  let perchId: string;

  const server = () => app.getHttpServer();
  const get = (query: Record<string, string> = {}, token = angler.accessToken) =>
    request(server())
      .get('/api/v1/me/stats')
      .query(query)
      .set({ Authorization: `Bearer ${token}` });
  const stats = async (query: Record<string, string> = {}) =>
    (await get(query).expect(200)).body as MyStats;
  const fish = (data: Record<string, unknown> = {}) =>
    createCatch(prisma, {
      userId: angler.id,
      permitId,
      fishingWaterId: zegrzeId,
      speciesId: pikeId,
      ...data,
    });

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    const user = await createVerifiedUser(prisma);
    angler = { id: user.id, accessToken: (await login(app, user.email)).accessToken };
    ({ id: zegrzeId } = await createWater(prisma, { name: 'Zalew Zegrzyński' }));
    ({ id: narewId } = await createWater(prisma, { name: 'Narew' }));
    ({ id: pikeId } = await createSpecies(prisma, { namePl: 'Szczupak' }));
    ({ id: perchId } = await createSpecies(prisma, { namePl: 'Okoń' }));
    ({ id: permitId } = await createPermit(prisma, { userId: angler.id, status: 'PAID' }));
    ({ id: externalPermitId } = await createExternalPermit(prisma, { userId: angler.id }));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('counts my accepted catches of the current season on permits of both kinds', async () => {
    await fish();
    await fish({ kept: false });
    await fish({ permitId: null, externalPermitId, fishingWaterId: narewId, speciesId: perchId });
    // Not counted: rejected, another season, someone else's.
    await fish({ syncStatus: 'REJECTED', violations: [] });
    await fish({ caughtAt: new Date('2025-12-31T22:30:00.000Z') });
    const other = await createUser(prisma);
    const othersPermit = await createPermit(prisma, { userId: other.id, status: 'PAID' });
    await fish({ userId: other.id, permitId: othersPermit.id });

    const body = await stats();

    expect(body).toMatchObject({ season: 2026, from: '2026-01-01', to: '2026-12-31' });
    expect(body.catches).toMatchObject({ count: 3, keptCount: 2, releasedCount: 1 });
    expect(body.catches.bySpecies).toEqual([
      { speciesId: pikeId, count: 2, keptCount: 1 },
      { speciesId: perchId, count: 1, keptCount: 1 },
    ]);
    expect(body.catches.byWater).toEqual([
      { water: { id: zegrzeId, name: 'Zalew Zegrzyński' }, count: 2, keptCount: 1 },
      { water: { id: narewId, name: 'Narew' }, count: 1, keptCount: 1 },
    ]);
  });

  it('takes the season from the query, by the Warsaw year of the catch', async () => {
    // 2025-12-31 23:30 in Warsaw: the old season, though 2026 in UTC terms it is not yet.
    await fish({ caughtAt: new Date('2025-12-31T22:30:00.000Z') });
    // 2026-01-01 00:30 in Warsaw.
    await fish({ caughtAt: new Date('2025-12-31T23:30:00.000Z') });

    expect((await stats({ season: '2025' })).catches).toMatchObject({ count: 1 });
    expect((await stats({ season: '2026' })).catches).toMatchObject({ count: 1 });
    expect(await stats({ season: '2024' })).toMatchObject({
      season: 2024,
      catches: { count: 0, bySpecies: [], byWater: [] },
    });
  });

  it('refuses a season outside 2000–2100 and a non-numeric one', async () => {
    for (const season of ['1999', '2101', 'abc']) {
      const response = await get({ season }).expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('needs a session and is never cached', async () => {
    await request(server()).get('/api/v1/me/stats').expect(401);
    expect((await get().expect(200)).headers['cache-control']).toBe('no-store');
  });
});
