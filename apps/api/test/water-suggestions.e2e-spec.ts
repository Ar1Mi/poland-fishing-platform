import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createClaim,
  createExternalPermit,
  createOrganization,
  createPermit,
  createSpecies,
  createWater,
} from './factories';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface AdminWater {
  id: string;
  name: string;
  type: string;
  status: string;
  region: string;
  lat: number | null;
  lng: number | null;
  source: string;
  sourceRef: string;
  isPublished: boolean;
  externalOwnerName: string | null;
  externalInfoUrl: string | null;
  importedAt: string | null;
  createdAt: string;
}

interface ErrorBody {
  code: string;
  details?: { fields?: Record<string, string[]> };
}

describe('water suggestions and the catalogue of the super admin (FR-25)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let angler: { id: string; accessToken: string };
  let superAdmin: { id: string; accessToken: string };

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const suggestion = (fields: Record<string, unknown> = {}) => ({
    name: 'Staw Dolny',
    type: 'POND',
    region: 'mazowieckie',
    lat: 52.4,
    lng: 21.0,
    ...fields,
  });
  const suggest = (fields: Record<string, unknown> = {}, token = angler.accessToken) =>
    request(server())
      .post('/api/v1/waters/suggestions')
      .set(bearer(token))
      .send(suggestion(fields));
  const suggested = async (fields: Record<string, unknown> = {}) =>
    (await suggest(fields).expect(201)).body as { id: string };
  const list = (query: Record<string, string> = {}, token = superAdmin.accessToken) =>
    request(server()).get('/api/v1/admin/waters').query(query).set(bearer(token));
  const patch = (id: string, body: object, token = superAdmin.accessToken) =>
    request(server()).patch(`/api/v1/admin/waters/${id}`).set(bearer(token)).send(body);
  const remove = (id: string, token = superAdmin.accessToken) =>
    request(server()).delete(`/api/v1/admin/waters/${id}`).set(bearer(token));
  const publicCard = (id: string) => request(server()).get(`/api/v1/waters/${id}`);
  const publicList = async () =>
    (
      (await request(server()).get('/api/v1/waters').expect(200)).body as {
        items: { id: string }[];
      }
    ).items;

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    for (const role of ['angler', 'superAdmin'] as const) {
      const user = await createVerifiedUser(prisma, { isSuperAdmin: role === 'superAdmin' });
      const session = { id: user.id, accessToken: (await login(app, user.email)).accessToken };
      if (role === 'angler') {
        angler = session;
      } else {
        superAdmin = session;
      }
    }
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /waters/suggestions', () => {
    it('stores an unpublished USER row that the public catalogue does not show', async () => {
      const response = await suggest({ name: '  Staw Dolny ' }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Staw Dolny',
        type: 'POND',
        region: 'mazowieckie',
        lat: 52.4,
        lng: 21.0,
        status: 'UNCLAIMED',
        source: 'USER',
        importedAt: null,
        organization: null,
      });
      const { id } = response.body as { id: string };
      const stored = await prisma.fishingWater.findUniqueOrThrow({ where: { id } });
      expect(stored).toMatchObject({ isPublished: false, source: 'USER' });
      expect(stored.sourceRef).toMatch(/^[0-9a-f-]{36}$/);
      await publicCard(id).expect(404);
      expect(await publicList()).toEqual([]);
      // Nobody is recorded as the author, and nothing is written to the audit log.
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('refuses bad fields and a position outside Poland, each on its own field', async () => {
      const fieldsOf = async (fields: Record<string, unknown>) =>
        Object.keys(((await suggest(fields).expect(400)).body as ErrorBody).details?.fields ?? {});

      expect(await fieldsOf({ name: 'S' })).toEqual(['name']);
      expect(await fieldsOf({ name: 'x'.repeat(201) })).toEqual(['name']);
      expect(await fieldsOf({ type: 'SEA' })).toEqual(['type']);
      expect(await fieldsOf({ region: 'Mazowieckie' })).toEqual(['region']);
      // Swapped coordinates.
      expect(await fieldsOf({ lat: 21.0, lng: 52.4 })).toEqual(['lat', 'lng']);
      expect(await fieldsOf({ lat: '52.4' })).toEqual(['lat']);
      expect(await fieldsOf({ isPublished: true })).toEqual(['isPublished']);
      expect(await prisma.fishingWater.count()).toBe(0);
    });

    it('needs a session', async () => {
      await request(server()).post('/api/v1/waters/suggestions').send(suggestion()).expect(401);
    });
  });

  describe('GET /admin/waters', () => {
    it('lists the suggestions waiting longest first, or the whole catalogue', async () => {
      const published = await createWater(prisma, { name: 'Narew', source: 'PZW' });
      const first = await suggested({ name: 'Staw Pierwszy' });
      const second = await suggested({ name: 'Staw Drugi' });

      const queue = (await list({ published: 'false' }).expect(200)).body as AdminWater[];
      expect(queue.map((water) => water.name)).toEqual(['Staw Pierwszy', 'Staw Drugi']);
      expect(queue[0]).toMatchObject({
        id: first.id,
        type: 'POND',
        region: 'mazowieckie',
        lat: 52.4,
        lng: 21.0,
        source: 'USER',
        isPublished: false,
        externalOwnerName: null,
        externalInfoUrl: null,
        importedAt: null,
      });
      expect(queue[0]!.createdAt).toMatch(/Z$/);

      const all = (await list().expect(200)).body as AdminWater[];
      expect(all.map((water) => water.id)).toEqual([published.id, first.id, second.id]);
      const onlyPublished = (await list({ published: 'true' }).expect(200)).body as AdminWater[];
      expect(onlyPublished.map((water) => water.id)).toEqual([published.id]);
      expect((await publicList()).map((water) => water.id)).toEqual([published.id]);
    });

    it('refuses a published value that is not a boolean and anyone but a super admin', async () => {
      expect(((await list({ published: 'maybe' }).expect(400)).body as ErrorBody).code).toBe(
        'VALIDATION_FAILED',
      );
      await list({}, angler.accessToken).expect(403);
    });
  });

  describe('PATCH /admin/waters/:id', () => {
    it('corrects the fields, publishes the suggestion and logs the diff', async () => {
      const { id } = await suggested({ name: 'staw dolny' });

      const response = await patch(id, {
        name: 'Staw Dolny',
        type: 'LAKE',
        externalOwnerName: 'Gmina Serock',
        isPublished: true,
      }).expect(200);

      expect(response.body).toMatchObject({
        id,
        name: 'Staw Dolny',
        type: 'LAKE',
        region: 'mazowieckie',
        externalOwnerName: 'Gmina Serock',
        isPublished: true,
        source: 'USER',
        importedAt: null,
      });
      expect((await publicCard(id).expect(200)).body).toMatchObject({
        name: 'Staw Dolny',
        source: 'USER',
        importedAt: null,
      });
      expect((await publicList()).map((water) => water.id)).toEqual([id]);
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: superAdmin.id,
          action: 'WATER_UPDATED',
          entity: 'FishingWater',
          entityId: id,
          diff: {
            name: { from: 'staw dolny', to: 'Staw Dolny' },
            type: { from: 'POND', to: 'LAKE' },
            externalOwnerName: { from: null, to: 'Gmina Serock' },
            isPublished: { from: false, to: true },
          },
        }),
      ]);
    });

    it('changes nothing and writes nothing when the fields are the same', async () => {
      const { id } = await suggested();

      const response = await patch(id, { name: 'Staw Dolny', lat: 52.4 }).expect(200);

      expect(response.body).toMatchObject({ id, isPublished: false });
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('keeps a position whole and in Poland', async () => {
      const { id } = await suggested();
      const fieldsOf = async (body: object) =>
        ((await patch(id, body).expect(400)).body as ErrorBody).details?.fields;

      expect(await fieldsOf({ lat: null })).toEqual({ lat: ['lat and lng go together'] });
      // Swapped coordinates: each outside its range.
      expect(Object.keys((await fieldsOf({ lat: 21.0, lng: 52.4 })) ?? {})).toEqual(['lat', 'lng']);
      expect(await fieldsOf({ lat: 60 })).toHaveProperty('lat');
      expect(await fieldsOf({ externalInfoUrl: 'ftp://x' })).toHaveProperty('externalInfoUrl');
      expect(await fieldsOf({ description: 'x' })).toHaveProperty('description');

      await patch(id, { lat: null, lng: null }).expect(200);
      expect(await prisma.fishingWater.findUniqueOrThrow({ where: { id } })).toMatchObject({
        lat: null,
        lng: null,
      });
    });

    it('answers 404 for an unknown water, 403 for anyone but a super admin', async () => {
      const { id } = await suggested();
      await patch(UNKNOWN_ID, { name: 'Nowa nazwa' }).expect(404);
      await patch(id, { name: 'Nowa nazwa' }, angler.accessToken).expect(403);
      await patch('not-a-uuid', { name: 'Nowa nazwa' }).expect(400);
    });
  });

  describe('PATCH /admin/waters/:id — what it refuses', () => {
    it('refuses null in a required field instead of failing', async () => {
      const { id } = await suggested();

      for (const field of ['name', 'type', 'region', 'isPublished']) {
        const response = await patch(id, { [field]: null }).expect(400);
        expect((response.body as ErrorBody).details?.fields).toHaveProperty(field);
      }
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('never hides a published water again: permits, rules and catches may refer to it', async () => {
      const published = await createWater(prisma, { name: 'Narew' });
      const { id } = await suggested();

      const response = await patch(published.id, { isPublished: false }).expect(400);
      expect((response.body as ErrorBody).details?.fields).toHaveProperty('isPublished');
      await patch(id, { isPublished: false }).expect(400);
      expect(
        (await prisma.fishingWater.findUniqueOrThrow({ where: { id: published.id } })).isPublished,
      ).toBe(true);
    });

    it('checks the position only when it changes', async () => {
      // Imported with a position just outside the box: the geocoder is limited by country.
      const water = await createWater(prisma, { name: 'Nysa', lat: 50.9, lng: 14.0 });

      await patch(water.id, { name: 'Nysa Łużycka' }).expect(200);
      expect(
        Object.keys(
          ((await patch(water.id, { lng: 13.9 }).expect(400)).body as ErrorBody).details?.fields ??
            {},
        ),
      ).toEqual(['lat']);
    });
  });

  describe('a suggestion and the register of catches', () => {
    it('refuses a catch on a suggestion, so it stays possible to reject it', async () => {
      const { id } = await suggested();
      const { id: speciesId } = await createSpecies(prisma);
      const permit = await createPermit(prisma, { userId: angler.id, status: 'PAID' });

      const response = await request(server())
        .post('/api/v1/catches/sync')
        .set(bearer(angler.accessToken))
        .send({
          items: [
            {
              clientId: randomUUID(),
              permitId: permit.id,
              externalPermitId: null,
              fishingWaterId: id,
              speciesId,
              caughtAt: '2026-10-06T08:00:00.000Z',
              lengthCm: 30,
              kept: false,
            },
          ],
        })
        .expect(400);

      expect((response.body as ErrorBody).details?.fields).toEqual({
        'items.0.fishingWaterId': ['Unknown fishingWaterId'],
      });
      await remove(id).expect(204);
    });

    it('still records a catch on a water that left the catalogue but is on the permit (T-22)', async () => {
      const left = await createWater(prisma, { name: 'Stary staw', isPublished: false });
      const { id: speciesId } = await createSpecies(prisma);
      const external = await createExternalPermit(prisma, {
        userId: angler.id,
        waters: { connect: [{ id: left.id }] },
      });

      const response = await request(server())
        .post('/api/v1/catches/sync')
        .set(bearer(angler.accessToken))
        .send({
          items: [
            {
              clientId: randomUUID(),
              permitId: null,
              externalPermitId: external.id,
              fishingWaterId: left.id,
              speciesId,
              caughtAt: '2026-10-06T08:00:00.000Z',
              lengthCm: 30,
              kept: false,
            },
          ],
        })
        .expect(200);

      expect((response.body as { results: { status: string }[] }).results).toEqual([
        expect.objectContaining({ status: 'ACCEPTED' }),
      ]);
    });
  });

  describe('DELETE /admin/waters/:id', () => {
    it('removes a suggestion with an audit entry', async () => {
      const { id } = await suggested();

      await remove(id).expect(204);

      expect(await prisma.fishingWater.count()).toBe(0);
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: superAdmin.id,
          action: 'WATER_DELETED',
          entity: 'FishingWater',
          entityId: id,
          diff: { name: 'Staw Dolny', source: 'USER', sourceRef: expect.any(String) as string },
        }),
      ]);
      await remove(id).expect(404);
    });

    it('keeps a published water and an unpublished one that is referenced', async () => {
      const published = await createWater(prisma, { name: 'Narew' });
      expect(((await remove(published.id).expect(409)).body as ErrorBody).code).toBe(
        'WATER_IN_USE',
      );

      // A claim of an organization points at it (a race with the queue): the database refuses.
      const hidden = await createWater(prisma, { isPublished: false });
      const organizationId = (await createOrganization(prisma, { status: 'ACTIVE' })).id;
      await createClaim(prisma, { fishingWaterId: hidden.id, organizationId });
      expect(((await remove(hidden.id).expect(409)).body as ErrorBody).code).toBe('WATER_IN_USE');
      // A catch written past the API (data from before T-27): the database refuses too.
      const withCatch = await createWater(prisma, { isPublished: false });
      const { id: speciesId } = await createSpecies(prisma);
      await createCatch(prisma, {
        userId: angler.id,
        fishingWaterId: withCatch.id,
        speciesId,
        permitId: (await createPermit(prisma, { userId: angler.id })).id,
      });
      expect(((await remove(withCatch.id).expect(409)).body as ErrorBody).code).toBe(
        'WATER_IN_USE',
      );

      expect(await prisma.fishingWater.count()).toBe(3);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('is for the super admin only', async () => {
      const { id } = await suggested();
      await remove(id, angler.accessToken).expect(403);
    });
  });
});
