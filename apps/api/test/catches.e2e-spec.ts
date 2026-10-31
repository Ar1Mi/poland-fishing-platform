import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/generated/prisma/client';
import { createVerifiedUser, login } from './auth-helpers';
import { FIXED_NOW, createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createExternalPermit,
  createOrganization,
  createPermit,
  createPermitType,
  createSpecies,
  createUser,
  createWater,
} from './factories';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface Violation {
  code: string;
  ruleId: string;
  details?: Record<string, unknown>;
}

interface SyncResult {
  clientId: string;
  id: string;
  status: 'ACCEPTED' | 'REJECTED';
  violations: Violation[];
}

interface Catch {
  id: string;
  clientId: string;
  permitId: string | null;
  water: { id: string; name: string };
  speciesId: string;
  caughtAt: string;
  weightG: number | null;
  kept: boolean;
  status: 'ACCEPTED' | 'REJECTED';
  violations: Violation[];
  editableUntil: string;
}

interface ErrorBody {
  code: string;
  details?: { fields?: Record<string, string[]>; editableUntil?: string };
}

/** On 6 October 2026 (CEST, UTC+2): `hour` is Warsaw time. */
const onOctober6 = (hour: number) => new Date(Date.UTC(2026, 9, 6, hour - 2)).toISOString();

// FIXED_NOW is 2026-10-06 17:20 in Warsaw; the window of that day closes on 7 October 24:00.
describe('catches', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let now: Date;
  let angler: { id: string; email: string; accessToken: string };
  let permitId: string;
  /** Connected to the organization and covered by the permit. */
  let lakeId: string;
  let riverId: string;
  /** Not connected, not covered by the permit. */
  let pondId: string;
  let organizationId: string;
  const species = { pike: '', perch: '', eel: '', bream: '', sturgeon: '' };

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A kept perch of 30 cm, 500 g, at 10:00 on the lake, on the angler's permit. */
  const item = (fields: Record<string, unknown> = {}) => ({
    clientId: randomUUID(),
    permitId,
    externalPermitId: null,
    fishingWaterId: lakeId,
    speciesId: species.perch,
    caughtAt: onOctober6(10),
    lengthCm: 30,
    weightG: 500,
    kept: true,
    lat: 52.43,
    lng: 21.03,
    ...fields,
  });

  const sync = (items: unknown[], token = angler.accessToken) =>
    request(server()).post('/api/v1/catches/sync').set(bearer(token)).send({ items });

  const syncOk = async (items: unknown[]) =>
    ((await sync(items).expect(200)).body as { results: SyncResult[] }).results;

  const myCatches = async (query = '') =>
    (
      await request(server())
        .get(`/api/v1/me/catches${query}`)
        .set(bearer(angler.accessToken))
        .expect(200)
    ).body as Catch[];

  /** Moves the clock; the access token lives 15 minutes by it, so the angler logs in again. */
  const moveTo = async (iso: string) => {
    now = new Date(iso);
    angler.accessToken = (await login(app, angler.email)).accessToken;
  };

  const rule = (data: Prisma.SpeciesRuleUncheckedCreateInput) =>
    prisma.speciesRule.create({ data });

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = FIXED_NOW;
    app = await createTestApp({ prisma, now: () => now });

    organizationId = (await createOrganization(prisma, { status: 'ACTIVE' })).id;
    lakeId = (
      await createWater(prisma, { name: 'Zalew Zegrzyński', status: 'CONNECTED', organizationId })
    ).id;
    riverId = (await createWater(prisma, { name: 'Narew', status: 'CONNECTED', organizationId }))
      .id;
    pondId = (await createWater(prisma, { name: 'Staw Wiejski' })).id;
    species.pike = (await createSpecies(prisma, { namePl: 'Szczupak' })).id;
    species.perch = (await createSpecies(prisma, { namePl: 'Okoń' })).id;
    species.eel = (await createSpecies(prisma, { namePl: 'Węgorz' })).id;
    species.bream = (await createSpecies(prisma, { namePl: 'Leszcz' })).id;
    species.sturgeon = (
      await createSpecies(prisma, { namePl: 'Jesiotr ostronosy', isProtected: true })
    ).id;
    // General rules, as the rozporządzenie would give them.
    await rule({
      speciesId: species.pike,
      minLengthCm: 50,
      closedFrom: '01-01',
      closedTo: '04-30',
    });
    await rule({ speciesId: species.eel, dailyLimitCount: 2 });
    await rule({ speciesId: species.bream, dailyLimitWeightG: 5000 });

    const user = await createVerifiedUser(prisma);
    angler = {
      id: user.id,
      email: user.email,
      accessToken: (await login(app, user.email)).accessToken,
    };
    const permitType = await createPermitType(prisma, {
      organizationId,
      durationDays: 31,
      waters: { connect: [{ id: lakeId }, { id: riverId }] },
    });
    permitId = (
      await createPermit(prisma, {
        userId: angler.id,
        permitTypeId: permitType.id,
        status: 'PAID',
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2026-10-31'),
      })
    ).id;
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /catches/sync', () => {
    it('accepts a catch that keeps every rule and stores it', async () => {
      const sent = item();

      const [result] = await syncOk([sent]);

      expect(result).toEqual({
        clientId: sent.clientId,
        id: expect.any(String) as string,
        status: 'ACCEPTED',
        violations: [],
      });
      const stored = await prisma.catchRecord.findUniqueOrThrow({ where: { id: result!.id } });
      expect(stored).toMatchObject({
        clientId: sent.clientId,
        userId: angler.id,
        permitId,
        externalPermitId: null,
        fishingWaterId: lakeId,
        speciesId: species.perch,
        caughtAt: new Date(sent.caughtAt),
        lengthCm: 30,
        weightG: 500,
        kept: true,
        lat: 52.43,
        lng: 21.03,
        syncStatus: 'ACCEPTED',
        violations: null,
      });
    });

    it('stores a catch that breaks a rule as REJECTED with every violation', async () => {
      const [result] = await syncOk([
        item({ speciesId: species.pike, lengthCm: 40, fishingWaterId: pondId }),
      ]);

      expect(result).toMatchObject({ status: 'REJECTED' });
      expect(result!.violations).toEqual([
        { code: 'PERMIT_WATER_MISMATCH', ruleId: 'BR-01' },
        { code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } },
      ]);
      const stored = await prisma.catchRecord.findUniqueOrThrow({ where: { id: result!.id } });
      expect(stored.syncStatus).toBe('REJECTED');
      expect(stored.violations).toEqual(result!.violations);
    });

    it('checks the permit at the time of the catch, not of the sync', async () => {
      await moveTo('2026-11-03T10:00:00.000Z');
      const [late] = await syncOk([item()]);
      expect(late!.status).toBe('ACCEPTED');

      await prisma.permit.update({ where: { id: permitId }, data: { status: 'REVOKED' } });
      const [revoked] = await syncOk([item()]);
      expect(revoked!.violations).toEqual([
        {
          code: 'PERMIT_NOT_ACTIVE',
          ruleId: 'BR-01',
          details: { status: 'REVOKED', validFrom: '2026-10-01', validTo: '2026-10-31' },
        },
      ]);
    });

    it('rejects a protected species kept and a catch more than 5 minutes ahead', async () => {
      const results = await syncOk([
        item({ speciesId: species.sturgeon, lengthCm: 120 }),
        item({ caughtAt: new Date(FIXED_NOW.getTime() + 5 * 60_000 + 1000).toISOString() }),
        item({ caughtAt: new Date(FIXED_NOW.getTime() + 5 * 60_000).toISOString() }),
      ]);

      expect(results.map((result) => result.violations.map((v) => v.code))).toEqual([
        ['PROTECTED_SPECIES'],
        ['CATCH_IN_FUTURE'],
        [],
      ]);
    });

    it('checks a batch in the order of caughtAt and answers in the order sent', async () => {
      const sent = [10, 8, 9].map((hour) =>
        item({ speciesId: species.eel, caughtAt: onOctober6(hour) }),
      );

      const results = await syncOk(sent);

      expect(results.map((result) => result.clientId)).toEqual(sent.map((s) => s.clientId));
      expect(results.map((result) => result.status)).toEqual(['REJECTED', 'ACCEPTED', 'ACCEPTED']);
      expect(results[0]!.violations).toEqual([
        { code: 'DAILY_COUNT_LIMIT', ruleId: 'BR-04', details: { limit: 2, alreadyKept: 2 } },
      ]);
    });

    it('counts the accepted catches of the whole day, also later ones synced before', async () => {
      await syncOk([
        item({ speciesId: species.eel, caughtAt: onOctober6(12) }),
        item({ speciesId: species.eel, caughtAt: onOctober6(13) }),
      ]);

      // The other phone sends the morning eel later: the day already has two.
      const [morning] = await syncOk([item({ speciesId: species.eel, caughtAt: onOctober6(6) })]);

      expect(morning!.violations.map((v) => v.code)).toEqual(['DAILY_COUNT_LIMIT']);
    });

    it('does not count released fish, rejected catches, other species or other days', async () => {
      await createCatch(prisma, {
        userId: angler.id,
        permitId,
        fishingWaterId: lakeId,
        speciesId: species.eel,
        kept: false,
      });
      await createCatch(prisma, {
        userId: angler.id,
        permitId,
        fishingWaterId: lakeId,
        speciesId: species.eel,
        syncStatus: 'REJECTED',
      });
      await createCatch(prisma, {
        userId: angler.id,
        permitId,
        fishingWaterId: lakeId,
        speciesId: species.perch,
      });
      // 5 October 23:59 and 7 October 00:00 in Warsaw.
      for (const caughtAt of ['2026-10-05T21:59:00.000Z', '2026-10-06T22:00:00.000Z']) {
        await createCatch(prisma, {
          userId: angler.id,
          permitId,
          fishingWaterId: lakeId,
          speciesId: species.eel,
          caughtAt: new Date(caughtAt),
        });
      }
      // Someone else's eels.
      const other = await createUser(prisma);
      for (let i = 0; i < 2; i++) {
        await createCatch(prisma, {
          userId: other.id,
          permitId: (await createPermit(prisma, { userId: other.id })).id,
          fishingWaterId: lakeId,
          speciesId: species.eel,
        });
      }

      const results = await syncOk([
        item({ speciesId: species.eel, caughtAt: onOctober6(10) }),
        item({ speciesId: species.eel, caughtAt: onOctober6(11) }),
      ]);

      expect(results.map((result) => result.status)).toEqual(['ACCEPTED', 'ACCEPTED']);
    });

    it('counts kept fish of every water towards the strictest limit of the water of the catch', async () => {
      await rule({
        speciesId: species.pike,
        organizationId,
        fishingWaterId: riverId,
        dailyLimitCount: 1,
      });
      const pike = (fields: Record<string, unknown>) =>
        item({ speciesId: species.pike, lengthCm: 60, ...fields });

      const results = await syncOk([
        pike({ fishingWaterId: lakeId, caughtAt: onOctober6(8) }),
        pike({ fishingWaterId: riverId, caughtAt: onOctober6(12) }),
        // The lake has no limit of its own: a second pike there is fine.
        pike({ fishingWaterId: lakeId, caughtAt: onOctober6(14) }),
      ]);

      expect(results.map((result) => result.status)).toEqual(['ACCEPTED', 'REJECTED', 'ACCEPTED']);
      expect(results[1]!.violations).toEqual([
        { code: 'DAILY_COUNT_LIMIT', ruleId: 'BR-04', details: { limit: 1, alreadyKept: 1 } },
      ]);
    });

    it('requires and sums the weight under a daily weight limit', async () => {
      const results = await syncOk([
        item({ speciesId: species.bream, weightG: 3000, caughtAt: onOctober6(8) }),
        item({ speciesId: species.bream, weightG: null, caughtAt: onOctober6(9) }),
        item({ speciesId: species.bream, weightG: 2500, caughtAt: onOctober6(10) }),
      ]);

      expect(results.map((result) => result.violations)).toEqual([
        [],
        [{ code: 'WEIGHT_REQUIRED', ruleId: 'BR-11' }],
        [
          {
            code: 'DAILY_WEIGHT_LIMIT',
            ruleId: 'BR-05',
            details: { limitG: 5000, alreadyKeptG: 3000 },
          },
        ],
      ]);
    });

    it('returns the stored result for a clientId sent again, without checking it again', async () => {
      const sent = item({ speciesId: species.pike, lengthCm: 40 });
      const [first] = await syncOk([sent]);

      const [again, next] = await syncOk([{ ...sent, lengthCm: 70 }, item()]);

      expect(again).toEqual(first);
      expect(next!.status).toBe('ACCEPTED');
      expect(await prisma.catchRecord.count()).toBe(2);
      const stored = await prisma.catchRecord.findUniqueOrThrow({ where: { id: first!.id } });
      expect(stored.lengthCm).toBe(40);
    });

    it('keeps the daily limit when two phones sync at the same time', async () => {
      const phone = (hours: number[]) =>
        sync(hours.map((hour) => item({ speciesId: species.eel, caughtAt: onOctober6(hour) })));

      const responses = await Promise.all([phone([8, 9]), phone([10, 11])]);

      const statuses = responses.flatMap((response) =>
        (response.body as { results: SyncResult[] }).results.map((result) => result.status),
      );
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(statuses.filter((status) => status === 'ACCEPTED')).toHaveLength(2);
      expect(statuses.filter((status) => status === 'REJECTED')).toHaveLength(2);
    });

    it('checks a catch on an external permit against the general rules only', async () => {
      // No-kill pike on the lake by its owner; the general minimum length still applies.
      await rule({
        speciesId: species.pike,
        organizationId,
        fishingWaterId: lakeId,
        dailyLimitCount: 0,
      });
      const external = await createExternalPermit(prisma, {
        userId: angler.id,
        waters: { connect: [{ id: lakeId }, { id: pondId }] },
      });
      const onExternal = (fields: Record<string, unknown>) =>
        item({ permitId: null, externalPermitId: external.id, speciesId: species.pike, ...fields });

      const results = await syncOk([
        onExternal({ lengthCm: 60, caughtAt: onOctober6(8) }),
        onExternal({ lengthCm: 45, fishingWaterId: pondId, caughtAt: onOctober6(9) }),
        onExternal({ lengthCm: 60, fishingWaterId: riverId, caughtAt: onOctober6(10) }),
        item({ speciesId: species.pike, lengthCm: 60, caughtAt: onOctober6(11) }),
      ]);

      expect(results.map((result) => result.violations.map((v) => v.code))).toEqual([
        [],
        ['BELOW_MIN_LENGTH'],
        ['PERMIT_WATER_MISMATCH'],
        ['DAILY_COUNT_LIMIT'],
      ]);
      const stored = await prisma.catchRecord.findUniqueOrThrow({
        where: { id: results[0]!.id },
      });
      expect(stored).toMatchObject({ permitId: null, externalPermitId: external.id });
    });

    it('rejects the whole batch for unknown references and stores nothing', async () => {
      const otherPermit = await createPermit(prisma);
      const otherExternal = await createExternalPermit(prisma, {
        waters: { connect: [{ id: lakeId }] },
      });

      const response = await sync([
        item(),
        item({ permitId: UNKNOWN_ID }),
        item({ permitId: otherPermit.id }),
        item({ permitId: null, externalPermitId: otherExternal.id }),
        item({ fishingWaterId: UNKNOWN_ID, speciesId: UNKNOWN_ID }),
      ]).expect(400);

      const body = response.body as ErrorBody;
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(body.details?.fields ?? {}).sort()).toEqual([
        'items.1.permitId',
        'items.2.permitId',
        'items.3.externalPermitId',
        'items.4.fishingWaterId',
        'items.4.speciesId',
      ]);
      expect(await prisma.catchRecord.count()).toBe(0);
    });

    it('requires exactly one permit and each clientId once', async () => {
      const repeated = item();
      const external = await createExternalPermit(prisma, { userId: angler.id });

      const response = await sync([
        item({ permitId: null }),
        item({ externalPermitId: external.id }),
        repeated,
        repeated,
      ]).expect(400);

      expect(Object.keys((response.body as ErrorBody).details?.fields ?? {}).sort()).toEqual([
        'items.0.permitId',
        'items.1.permitId',
        'items.3.clientId',
      ]);
    });

    it('rejects a clientId of someone else without telling whose', async () => {
      const other = await createUser(prisma);
      const taken = await createCatch(prisma, {
        userId: other.id,
        permitId: (await createPermit(prisma, { userId: other.id })).id,
        fishingWaterId: lakeId,
        speciesId: species.perch,
      });

      const response = await sync([item(), item({ clientId: taken.clientId })]).expect(400);

      expect((response.body as ErrorBody).details?.fields).toEqual({
        'items.1.clientId': ['clientId is already used'],
      });
      expect(await prisma.catchRecord.count()).toBe(1);
    });

    it.each([
      ['no items', []],
      ['101 items', Array.from({ length: 101 }, () => ({}))],
    ])('rejects a batch of %s', async (_, items) => {
      const response = await sync(items.map(() => item())).expect(400);
      expect((response.body as ErrorBody).details?.fields).toHaveProperty('items');
    });

    it.each([
      ['caughtAt', { caughtAt: '2026-10-06T10:00:00' }],
      ['caughtAt', { caughtAt: '2026-02-30T10:00:00Z' }],
      ['lengthCm', { lengthCm: 0 }],
      ['lengthCm', { lengthCm: 401 }],
      ['lengthCm', { lengthCm: 42.5 }],
      ['weightG', { weightG: 0 }],
      ['weightG', { weightG: 300_001 }],
      ['lng', { lng: null }],
      ['lat', { lat: 91 }],
      ['kept', { kept: 'yes' }],
      ['clientId', { clientId: 'phone-1' }],
    ])('rejects an invalid %s', async (field, fields) => {
      const response = await sync([item(fields)]).expect(400);
      expect(Object.keys((response.body as ErrorBody).details?.fields ?? {})).toEqual([
        `items.0.${field}`,
      ]);
    });

    it('accepts a catch without weight and position', async () => {
      const [result] = await syncOk([item({ weightG: null, lat: null, lng: null })]);
      expect(result!.status).toBe('ACCEPTED');
    });

    it('requires a login', async () => {
      await request(server())
        .post('/api/v1/catches/sync')
        .send({ items: [item()] })
        .expect(401);
    });
  });

  describe('GET /me/catches', () => {
    it('lists my catches of the current season, latest first, with their verdicts', async () => {
      const [accepted, rejected] = await syncOk([
        item({ caughtAt: onOctober6(8) }),
        item({ speciesId: species.pike, lengthCm: 40, caughtAt: onOctober6(12) }),
      ]);
      await createCatch(prisma, {
        userId: angler.id,
        permitId,
        fishingWaterId: lakeId,
        speciesId: species.perch,
        caughtAt: new Date('2025-10-06T08:00:00.000Z'),
      });
      const other = await createUser(prisma);
      await createCatch(prisma, {
        userId: other.id,
        permitId: (await createPermit(prisma, { userId: other.id })).id,
        fishingWaterId: lakeId,
        speciesId: species.perch,
      });

      const response = await request(server())
        .get('/api/v1/me/catches')
        .set(bearer(angler.accessToken))
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      const catches = response.body as Catch[];
      expect(catches.map((fish) => fish.id)).toEqual([rejected!.id, accepted!.id]);
      expect(catches[0]).toMatchObject({
        permitId,
        water: { id: lakeId, name: 'Zalew Zegrzyński' },
        speciesId: species.pike,
        caughtAt: onOctober6(12),
        status: 'REJECTED',
        violations: [{ code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } }],
        editableUntil: '2026-10-07T22:00:00.000Z',
      });
      expect(catches[1]).toMatchObject({ status: 'ACCEPTED', violations: [] });
    });

    it('takes the season by the Warsaw year and filters by permit', async () => {
      const permitOf2025 = (
        await createPermit(prisma, {
          userId: angler.id,
          status: 'PAID',
          validFrom: new Date('2025-12-01'),
          validTo: new Date('2026-01-31'),
        })
      ).id;
      const at = (caughtAt: string, permit = permitId) =>
        createCatch(prisma, {
          userId: angler.id,
          permitId: permit,
          fishingWaterId: lakeId,
          speciesId: species.perch,
          caughtAt: new Date(caughtAt),
        });
      // 31 December 23:59 and 1 January 00:30 in Warsaw (UTC+1).
      const lastOf2025 = await at('2025-12-31T22:59:00.000Z', permitOf2025);
      const firstOf2026 = await at('2025-12-31T23:30:00.000Z', permitOf2025);
      const october = await at('2026-10-06T08:00:00.000Z');

      expect((await myCatches('?season=2025')).map((fish) => fish.id)).toEqual([lastOf2025.id]);
      expect((await myCatches('?season=2026')).map((fish) => fish.id)).toEqual([
        october.id,
        firstOf2026.id,
      ]);
      expect((await myCatches(`?permitId=${permitOf2025}`)).map((fish) => fish.id)).toEqual([
        firstOf2026.id,
      ]);
    });

    it.each(['?season=26', '?season=abc', '?permitId=1'])(
      'rejects an invalid filter %s',
      async (query) => {
        await request(server())
          .get(`/api/v1/me/catches${query}`)
          .set(bearer(angler.accessToken))
          .expect(400);
      },
    );
  });

  describe('PATCH /catches/:id', () => {
    const patch = (id: string, body: object) =>
      request(server()).patch(`/api/v1/catches/${id}`).set(bearer(angler.accessToken)).send(body);

    it('changes the catch and checks it again: a rejected one can be fixed', async () => {
      const [rejected] = await syncOk([item({ speciesId: species.bream, weightG: null })]);
      expect(rejected!.violations.map((v) => v.code)).toEqual(['WEIGHT_REQUIRED']);

      const response = await patch(rejected!.id, { weightG: 1200 }).expect(200);

      expect(response.body).toMatchObject({
        id: rejected!.id,
        weightG: 1200,
        status: 'ACCEPTED',
        violations: [],
      });
      const stored = await prisma.catchRecord.findUniqueOrThrow({ where: { id: rejected!.id } });
      expect(stored).toMatchObject({ weightG: 1200, syncStatus: 'ACCEPTED', violations: null });
    });

    it('rejects an accepted catch that the change makes break a rule', async () => {
      const [accepted] = await syncOk([item({ speciesId: species.pike, lengthCm: 60 })]);

      const response = await patch(accepted!.id, { lengthCm: 45 }).expect(200);

      expect((response.body as Catch).status).toBe('REJECTED');
      expect((response.body as Catch).violations).toEqual([
        { code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } },
      ]);
    });

    it('does not count the changed catch itself towards the daily limit', async () => {
      const results = await syncOk([
        item({ speciesId: species.eel, caughtAt: onOctober6(8) }),
        item({ speciesId: species.eel, caughtAt: onOctober6(9) }),
      ]);

      const response = await patch(results[1]!.id, { lengthCm: 55 }).expect(200);

      expect((response.body as Catch).status).toBe('ACCEPTED');
    });

    it('changes species, water, time and whether kept, but not the permit', async () => {
      const [stored] = await syncOk([item()]);

      const response = await patch(stored!.id, {
        speciesId: species.pike,
        fishingWaterId: riverId,
        caughtAt: onOctober6(7),
        lengthCm: 48,
        kept: false,
      }).expect(200);

      expect(response.body).toMatchObject({
        speciesId: species.pike,
        water: { id: riverId, name: 'Narew' },
        caughtAt: onOctober6(7),
        kept: false,
        status: 'ACCEPTED',
      });
      await patch(stored!.id, { permitId: UNKNOWN_ID }).expect(400);
      await patch(stored!.id, { lat: 52 }).expect(400);
    });

    it('closes at the end of the day of the catch plus 24 hours', async () => {
      const [stored] = await syncOk([item()]);

      await moveTo('2026-10-07T21:59:59.999Z');
      await patch(stored!.id, { lengthCm: 31 }).expect(200);

      await moveTo('2026-10-07T22:00:00.000Z');
      const response = await patch(stored!.id, { lengthCm: 32 }).expect(422);
      expect(response.body).toMatchObject({
        code: 'EDIT_WINDOW_CLOSED',
        details: { editableUntil: '2026-10-07T22:00:00.000Z' },
      });
    });

    it('does not move a catch into a day whose window has closed', async () => {
      const [stored] = await syncOk([item()]);

      const response = await patch(stored!.id, { caughtAt: '2026-10-04T10:00:00Z' }).expect(422);

      expect(response.body).toMatchObject({
        code: 'EDIT_WINDOW_CLOSED',
        details: { editableUntil: '2026-10-05T22:00:00.000Z' },
      });
    });

    it('answers 404 for a catch of someone else and 400 for unknown references', async () => {
      const other = await createUser(prisma);
      const foreign = await createCatch(prisma, {
        userId: other.id,
        permitId: (await createPermit(prisma, { userId: other.id })).id,
        fishingWaterId: lakeId,
        speciesId: species.perch,
      });
      const [mine] = await syncOk([item()]);

      await patch(foreign.id, { lengthCm: 31 }).expect(404);
      await patch(UNKNOWN_ID, { lengthCm: 31 }).expect(404);
      const response = await patch(mine!.id, { speciesId: UNKNOWN_ID }).expect(400);
      expect((response.body as ErrorBody).details?.fields).toHaveProperty('speciesId');
      await patch('not-a-uuid', { lengthCm: 31 }).expect(400);
    });
  });

  describe('DELETE /catches/:id', () => {
    const remove = (id: string) =>
      request(server()).delete(`/api/v1/catches/${id}`).set(bearer(angler.accessToken));

    it('deletes my catch within the window', async () => {
      const [stored] = await syncOk([item()]);

      await remove(stored!.id).expect(204);

      expect(await prisma.catchRecord.count()).toBe(0);
    });

    it('keeps a catch after the window and a catch of someone else', async () => {
      const [stored] = await syncOk([item()]);
      const other = await createUser(prisma);
      const foreign = await createCatch(prisma, {
        userId: other.id,
        permitId: (await createPermit(prisma, { userId: other.id })).id,
        fishingWaterId: lakeId,
        speciesId: species.perch,
      });

      await remove(foreign.id).expect(404);
      await moveTo('2026-10-07T22:00:00.000Z');
      const response = await remove(stored!.id).expect(422);

      expect((response.body as ErrorBody).code).toBe('EDIT_WINDOW_CLOSED');
      expect(await prisma.catchRecord.count()).toBe(2);
    });
  });
});
