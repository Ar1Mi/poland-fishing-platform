import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EXTERNAL_PERMIT_MAX_WATERS, EXTERNAL_PERMIT_PHOTO_MAX_BYTES } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { RegisterPdfService } from '../src/modules/catches/register/register-pdf.service';
import { createVerifiedUser, login } from './auth-helpers';
import { FIXED_NOW, createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createExternalPermit,
  createOrganization,
  createSpecies,
  createWater,
} from './factories';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const UPLOADS_DIR = process.env.UPLOADS_DIR!;

interface ExternalPermit {
  id: string;
  issuerName: string;
  number: string | null;
  status: string;
  validFrom: string;
  validTo: string;
  waters: { id: string; name: string }[];
  photoType: string | null;
  createdAt: string;
}

interface ErrorBody {
  code: string;
  details?: { fields?: Record<string, string[]> };
}

/** Collects a binary body (PDF, photo) instead of parsing it. */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

// FIXED_NOW is 2026-10-06 17:20 in Warsaw.
describe('external permits', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let angler: { id: string; accessToken: string };
  let other: { id: string; accessToken: string };
  /** Unclaimed: no organization to buy a permit from (scenario Г). */
  let lakeId: string;
  let pondId: string;
  /** Connected to an organization with its own rule of perch. */
  let connectedId: string;
  let perchId: string;
  let pikeId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const body = (fields: Record<string, unknown> = {}) => ({
    issuerName: 'Gospodarstwo Rybackie Wąsosze',
    number: '123/2026',
    validFrom: '2026-05-01',
    validTo: '2026-12-31',
    waterIds: [lakeId],
    ...fields,
  });
  const create = (fields: Record<string, unknown> = {}, token = angler.accessToken) =>
    request(server()).post('/api/v1/me/external-permits').set(bearer(token)).send(body(fields));
  const created = async (fields: Record<string, unknown> = {}) =>
    (await create(fields).expect(201)).body as ExternalPermit;
  const patch = (id: string, fields: Record<string, unknown>, token = angler.accessToken) =>
    request(server()).patch(`/api/v1/me/external-permits/${id}`).set(bearer(token)).send(fields);
  const putPhoto = (id: string, file: Buffer, token = angler.accessToken) =>
    request(server())
      .put(`/api/v1/me/external-permits/${id}/photo`)
      .set(bearer(token))
      .attach('file', file, { filename: 'zezwolenie.png', contentType: 'image/png' });
  const storedPhotos = async () =>
    readdir(join(UPLOADS_DIR, 'external-permits')).catch(() => [] as string[]);

  beforeEach(async () => {
    // UPLOADS_DIR is one per test file: each test counts only its own photos.
    await rm(join(UPLOADS_DIR, 'external-permits'), { recursive: true, force: true });
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma, now: () => FIXED_NOW });

    lakeId = (await createWater(prisma, { name: 'Jezioro Wąsosze' })).id;
    pondId = (await createWater(prisma, { name: 'Staw Dolny' })).id;
    const organizationId = (await createOrganization(prisma, { status: 'ACTIVE' })).id;
    connectedId = (
      await createWater(prisma, { name: 'Zalew Zegrzyński', status: 'CONNECTED', organizationId })
    ).id;
    perchId = (await createSpecies(prisma, { namePl: 'Okoń' })).id;
    pikeId = (await createSpecies(prisma, { namePl: 'Szczupak' })).id;
    await prisma.speciesRule.create({ data: { speciesId: pikeId, minLengthCm: 50 } });
    await prisma.speciesRule.create({
      data: { speciesId: perchId, organizationId, dailyLimitCount: 1 },
    });

    for (const target of ['angler', 'other'] as const) {
      const user = await createVerifiedUser(prisma);
      const session = { id: user.id, accessToken: (await login(app, user.email)).accessToken };
      if (target === 'angler') {
        angler = session;
      } else {
        other = session;
      }
    }
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST and GET /me/external-permits', () => {
    it('adds a permit on catalogue waters and lists it with the status of its dates', async () => {
      const response = await create({
        issuerName: '  Gospodarstwo Rybackie Wąsosze ',
        number: ' 123/2026 ',
        waterIds: [pondId, lakeId, connectedId],
      }).expect(201);

      expect(response.headers['cache-control']).toBe('no-store');
      const permit = response.body as ExternalPermit;
      expect(permit).toMatchObject({
        issuerName: 'Gospodarstwo Rybackie Wąsosze',
        number: '123/2026',
        status: 'ACTIVE',
        validFrom: '2026-05-01',
        validTo: '2026-12-31',
        photoType: null,
      });
      // By name; a connected water is allowed too: the permit was bought outside the platform.
      expect(permit.waters.map((water) => water.name)).toEqual([
        'Jezioro Wąsosze',
        'Staw Dolny',
        'Zalew Zegrzyński',
      ]);

      const list = await request(server())
        .get('/api/v1/me/external-permits')
        .set(bearer(angler.accessToken))
        .expect(200);
      expect(list.headers['cache-control']).toBe('no-store');
      expect(list.body).toEqual([permit]);
    });

    it('stores a blank number as none and computes SCHEDULED and EXPIRED', async () => {
      const scheduled = await created({
        number: '',
        validFrom: '2026-10-07',
        validTo: '2026-10-07',
      });
      const expired = await created({
        number: null,
        validFrom: '2026-10-05',
        validTo: '2026-10-05',
      });
      const withoutNumber = await created({ number: undefined });

      expect(scheduled).toMatchObject({ number: null, status: 'SCHEDULED' });
      expect(expired).toMatchObject({ number: null, status: 'EXPIRED' });
      expect(withoutNumber.number).toBeNull();

      const list = (
        await request(server())
          .get('/api/v1/me/external-permits')
          .set(bearer(angler.accessToken))
          .expect(200)
      ).body as ExternalPermit[];
      // Latest start first.
      expect(list.map((permit) => permit.id)).toEqual([scheduled.id, expired.id, withoutNumber.id]);
    });

    it.each([
      ['the last day before the first', { validFrom: '2026-10-06', validTo: '2026-10-05' }],
      ['longer than 366 days', { validFrom: '2026-01-01', validTo: '2027-01-02' }],
      ['a start more than 365 days ahead', { validFrom: '2027-10-07', validTo: '2027-10-08' }],
      ['a day before the seasons', { validFrom: '1999-12-31', validTo: '2000-01-02' }],
    ])('refuses %s on validTo', async (_case, dates) => {
      const response = await create(dates).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { validTo: [expect.any(String) as unknown] } },
      });
      expect(await prisma.externalPermit.count()).toBe(0);
    });

    it('takes the ids of waters in any case of letters, as one water', async () => {
      const permit = await created({ waterIds: [lakeId.toUpperCase()] });

      expect(permit.waters.map((water) => water.id)).toEqual([lakeId]);
      await create({ waterIds: [lakeId, lakeId.toUpperCase()] }).expect(400);
    });

    it('refuses waters outside the catalogue, repeated or too many', async () => {
      const hidden = await createWater(prisma, { isPublished: false });
      const tooMany = Array.from({ length: EXTERNAL_PERMIT_MAX_WATERS + 1 }, () => randomUUID());

      for (const waterIds of [[UNKNOWN_ID], [lakeId, hidden.id], [lakeId, lakeId], [], tooMany]) {
        const response = await create({ waterIds }).expect(400);
        expect((response.body as ErrorBody).details?.fields).toHaveProperty('waterIds');
      }
      expect(await prisma.externalPermit.count()).toBe(0);
    });

    it('refuses a missing issuer, a malformed date and unknown fields', async () => {
      await create({ issuerName: '  ' }).expect(400);
      await create({ validFrom: '2026-02-30' }).expect(400);
      await create({ userId: other.id }).expect(400);
    });

    it('shows a permit of someone else as unknown', async () => {
      const foreign = await createExternalPermit(prisma, { userId: other.id });
      const get = (id: string) =>
        request(server()).get(`/api/v1/me/external-permits/${id}`).set(bearer(angler.accessToken));

      expect((await get(foreign.id).expect(404)).body).toMatchObject({ code: 'NOT_FOUND' });
      await get(UNKNOWN_ID).expect(404);
      await get('not-a-uuid').expect(400);
      const list = await request(server())
        .get('/api/v1/me/external-permits')
        .set(bearer(angler.accessToken))
        .expect(200);
      expect(list.body).toEqual([]);
    });

    it('needs a login', async () => {
      await request(server()).get('/api/v1/me/external-permits').expect(401);
      await request(server()).post('/api/v1/me/external-permits').send(body()).expect(401);
    });
  });

  describe('PATCH /me/external-permits/:id', () => {
    it('changes the fields and removes the number with null', async () => {
      const permit = await created();

      const response = await patch(permit.id, {
        issuerName: 'Okręg PZW Warszawa',
        number: null,
        validTo: '2026-10-31',
        waterIds: [pondId],
      }).expect(200);

      expect(response.body).toMatchObject({
        issuerName: 'Okręg PZW Warszawa',
        number: null,
        validFrom: '2026-05-01',
        validTo: '2026-10-31',
        waters: [{ id: pondId, name: 'Staw Dolny' }],
      });
    });

    it('does not check again the catches already on the permit', async () => {
      const permit = await created();
      const fish = await createCatch(prisma, {
        userId: angler.id,
        externalPermitId: permit.id,
        fishingWaterId: lakeId,
        speciesId: perchId,
        caughtAt: new Date('2026-06-01T10:00:00.000Z'),
      });

      // The catch on the lake in June is no longer covered by the dates or the waters.
      await patch(permit.id, { validFrom: '2026-07-01', waterIds: [pondId] }).expect(200);

      const stored = await prisma.catchRecord.findUniqueOrThrow({ where: { id: fish.id } });
      expect(stored.syncStatus).toBe('ACCEPTED');
    });

    it('checks the dates as they will be stored', async () => {
      const permit = await created();

      const response = await patch(permit.id, { validTo: '2026-04-30' }).expect(400);

      expect((response.body as ErrorBody).details?.fields).toHaveProperty('validTo');
    });

    it('keeps a water that has left the catalogue, but adds only catalogue waters', async () => {
      const permit = await created({ waterIds: [lakeId, pondId] });
      await prisma.fishingWater.update({ where: { id: pondId }, data: { isPublished: false } });
      const hidden = await createWater(prisma, { isPublished: false });

      await patch(permit.id, { waterIds: [pondId, lakeId] }).expect(200);
      await patch(permit.id, { waterIds: [lakeId, hidden.id] }).expect(400);
    });

    it('refuses null fields and a permit of someone else', async () => {
      const permit = await created();
      const foreign = await createExternalPermit(prisma, { userId: other.id });

      await patch(permit.id, { issuerName: null }).expect(400);
      await patch(foreign.id, { issuerName: 'Mój' }).expect(404);
      expect(
        (await prisma.externalPermit.findUniqueOrThrow({ where: { id: foreign.id } })).issuerName,
      ).toBe('Okręg PZW Warszawa');
    });
  });

  describe('DELETE /me/external-permits/:id', () => {
    it('deletes a permit without catches with its photo', async () => {
      const permit = await created();
      await putPhoto(permit.id, PNG).expect(200);
      expect(await storedPhotos()).toHaveLength(1);

      await request(server())
        .delete(`/api/v1/me/external-permits/${permit.id}`)
        .set(bearer(angler.accessToken))
        .expect(204);

      expect(await prisma.externalPermit.count()).toBe(0);
      expect(await storedPhotos()).toEqual([]);
    });

    it('keeps a permit with catches', async () => {
      const permit = await created();
      await putPhoto(permit.id, PNG).expect(200);
      await createCatch(prisma, {
        userId: angler.id,
        externalPermitId: permit.id,
        fishingWaterId: lakeId,
        speciesId: perchId,
      });

      const response = await request(server())
        .delete(`/api/v1/me/external-permits/${permit.id}`)
        .set(bearer(angler.accessToken))
        .expect(409);

      expect(response.body).toMatchObject({ code: 'EXTERNAL_PERMIT_IN_USE' });
      expect(await prisma.externalPermit.count()).toBe(1);
      expect(await storedPhotos()).toHaveLength(1);
    });

    it('does not delete a permit of someone else', async () => {
      const foreign = await createExternalPermit(prisma, { userId: other.id });

      await request(server())
        .delete(`/api/v1/me/external-permits/${foreign.id}`)
        .set(bearer(angler.accessToken))
        .expect(404);
      expect(await prisma.externalPermit.count()).toBe(1);
    });
  });

  describe('photo', () => {
    const getPhoto = (id: string, token = angler.accessToken) =>
      request(server())
        .get(`/api/v1/me/external-permits/${id}/photo`)
        .set(bearer(token))
        .buffer(true)
        .parse(binary);

    it('stores, serves as an attachment, replaces and removes the photo', async () => {
      const permit = await created();

      const stored = await putPhoto(permit.id, PNG).expect(200);
      expect(stored.body).toMatchObject({ id: permit.id, photoType: 'image/png' });
      const served = await getPhoto(permit.id).expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['content-disposition']).toBe(
        `attachment; filename="zezwolenie-${permit.id}.png"`,
      );
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['cache-control']).toBe('no-store');
      expect(served.body).toEqual(PNG);

      // A scan as a PDF replaces the photo; the old file goes.
      await putPhoto(permit.id, PDF).expect(200);
      expect(await storedPhotos()).toEqual([expect.stringMatching(/\.pdf$/) as unknown]);
      expect((await getPhoto(permit.id).expect(200)).body).toEqual(PDF);

      await request(server())
        .delete(`/api/v1/me/external-permits/${permit.id}/photo`)
        .set(bearer(angler.accessToken))
        .expect(204);
      expect(await storedPhotos()).toEqual([]);
      await getPhoto(permit.id).expect(404);
      const after = await request(server())
        .get(`/api/v1/me/external-permits/${permit.id}`)
        .set(bearer(angler.accessToken))
        .expect(200);
      expect(after.body).toMatchObject({ photoType: null });
    });

    it('refuses a file that is not a picture or a PDF, a missing file and a too big one', async () => {
      const permit = await created();

      const text = await putPhoto(permit.id, Buffer.from('not really a picture')).expect(400);
      expect((text.body as ErrorBody).details?.fields).toHaveProperty('file');
      await request(server())
        .put(`/api/v1/me/external-permits/${permit.id}/photo`)
        .set(bearer(angler.accessToken))
        .expect(400);
      const big = Buffer.concat([PNG, Buffer.alloc(EXTERNAL_PERMIT_PHOTO_MAX_BYTES)]);
      const tooBig = await putPhoto(permit.id, big).expect(413);
      expect(tooBig.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await storedPhotos()).toEqual([]);
    });

    it('keeps the photo of someone else out of reach', async () => {
      const permit = await created();

      await putPhoto(permit.id, PNG, other.accessToken).expect(404);
      await putPhoto(permit.id, PNG).expect(200);
      await getPhoto(permit.id, other.accessToken).expect(404);
      await request(server())
        .delete(`/api/v1/me/external-permits/${permit.id}/photo`)
        .set(bearer(other.accessToken))
        .expect(404);
      expect(await storedPhotos()).toHaveLength(1);
    });
  });

  describe('GET /me/external-permits/:id/offline-bundle', () => {
    it('gives the general rules on every water, not the rules of an organization', async () => {
      const permit = await created({ waterIds: [connectedId, lakeId] });

      const response = await request(server())
        .get(`/api/v1/me/external-permits/${permit.id}/offline-bundle`)
        .set(bearer(angler.accessToken))
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      const general = [
        {
          speciesId: pikeId,
          minLengthCm: 50,
          dailyLimitCount: null,
          dailyLimitWeightG: null,
          closedPeriods: [],
        },
      ];
      expect(response.body).toEqual({
        permit,
        waterRules: [
          { waterId: lakeId, rules: general },
          { waterId: connectedId, rules: general },
        ],
      });
    });

    it('is only for the owner', async () => {
      const permit = await created();

      await request(server())
        .get(`/api/v1/me/external-permits/${permit.id}/offline-bundle`)
        .set(bearer(other.accessToken))
        .expect(404);
    });
  });

  describe('GET /me/external-permits/:id/register.pdf', () => {
    const register = (id: string, query = '', token = angler.accessToken) =>
      request(server())
        .get(`/api/v1/me/external-permits/${id}/register.pdf${query}`)
        .set(bearer(token))
        .buffer(true)
        .parse(binary);

    it('serves the season register as a PDF attachment', async () => {
      const permit = await created();
      await createCatch(prisma, {
        userId: angler.id,
        externalPermitId: permit.id,
        fishingWaterId: lakeId,
        speciesId: perchId,
        caughtAt: new Date('2026-06-01T10:00:00.000Z'),
      });

      const response = await register(permit.id).expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="rejestr-polowow-2026.pdf"',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect((response.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('lists the kept fish of this permit in the Warsaw season, rejected ones too, by time', async () => {
      const permit = await created({ validFrom: '2025-12-01', validTo: '2026-11-30' });
      const otherPermit = await created();
      const foreign = await createExternalPermit(prisma, { userId: other.id });
      const fish = (caughtAt: string, data: Record<string, unknown> = {}) =>
        createCatch(prisma, {
          userId: angler.id,
          externalPermitId: permit.id,
          fishingWaterId: lakeId,
          speciesId: perchId,
          caughtAt: new Date(caughtAt),
          ...data,
        });
      // 23:59:59 on 31 December in Warsaw (CET, UTC+1): still 2025.
      await fish('2025-12-31T22:59:59.000Z', { lengthCm: 31 });
      // 00:00 on 1 January in Warsaw: the first instant of 2026.
      const newYear = await fish('2026-01-01T00:00:00.000+01:00', { lengthCm: 32 });
      const rejected = await fish('2026-03-01T10:00:00.000Z', {
        speciesId: pikeId,
        lengthCm: 40,
        syncStatus: 'REJECTED',
        violations: [{ code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } }],
      });
      const june = await fish('2026-06-01T10:00:00.000Z', { lengthCm: 33 });
      // Not in the register: released, another permit of the angler, someone else's catch.
      await fish('2026-06-02T10:00:00.000Z', { kept: false });
      await fish('2026-06-03T10:00:00.000Z', { externalPermitId: otherPermit.id });
      await createCatch(prisma, {
        userId: other.id,
        externalPermitId: foreign.id,
        fishingWaterId: lakeId,
        speciesId: perchId,
        caughtAt: new Date('2026-06-04T10:00:00.000Z'),
      });
      const render = jest.spyOn(app.get(RegisterPdfService), 'render');

      await register(permit.id, '?season=2026').expect(200);
      await register(permit.id, '?season=2025').expect(200);

      const [season2026, season2025] = render.mock.calls.map(([input]) => input);
      expect(season2026!.season).toBe(2026);
      expect(season2026!.catches.map((catch_) => catch_.id)).toEqual([
        newYear.id,
        rejected.id,
        june.id,
      ]);
      expect(season2026!.catches[1]).toMatchObject({
        status: 'REJECTED',
        violations: [{ code: 'BELOW_MIN_LENGTH' }],
      });
      expect(season2026!.speciesNames.get(pikeId)).toBe('Szczupak');
      expect(season2026!.holder).toEqual({
        firstName: 'Jan',
        lastName: 'Kowalski',
        anglerCardNo: null,
      });
      expect(season2025!.catches.map((catch_) => catch_.lengthCm)).toEqual([31]);
    });

    it('names the asked season, an empty one too', async () => {
      const permit = await created();

      const response = await register(permit.id, '?season=2025').expect(200);

      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="rejestr-polowow-2025.pdf"',
      );
    });

    it('refuses a season out of range and a permit of someone else', async () => {
      const permit = await created();

      await register(permit.id, '?season=1999').expect(400);
      await register(permit.id, '?season=abc').expect(400);
      await register(permit.id, '', other.accessToken).expect(404);
      await register('not-a-uuid').expect(400);
    });
  });
});
