import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CATCH_PHOTO_MAX_BYTES } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login, PASSWORD } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createCatch, createPermit, createSpecies, createWater } from './factories';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const UPLOADS_DIR = process.env.UPLOADS_DIR!;

interface ErrorBody {
  code: string;
  details?: { fields?: Record<string, string[]>; editableUntil?: string };
}

/** Collects a binary body instead of parsing it. */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

// FIXED_NOW is 2026-10-06 17:20 in Warsaw: a catch of this morning is still editable (BR-07).
describe('photo of a catch (FR-14)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let angler: { id: string; email: string; accessToken: string };
  let other: { id: string; accessToken: string };
  let permitId: string;
  let waterId: string;
  let speciesId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const fish = (data: Record<string, unknown> = {}) =>
    createCatch(prisma, {
      userId: angler.id,
      permitId,
      fishingWaterId: waterId,
      speciesId,
      ...data,
    });
  const putPhoto = (id: string, file: Buffer, token = angler.accessToken) =>
    request(server())
      .put(`/api/v1/catches/${id}/photo`)
      .set(bearer(token))
      .attach('file', file, { filename: 'ryba.png', contentType: 'image/png' });
  const getPhoto = (id: string, token = angler.accessToken) =>
    request(server())
      .get(`/api/v1/catches/${id}/photo`)
      .set(bearer(token))
      .buffer(true)
      .parse(binary);
  const deletePhoto = (id: string, token = angler.accessToken) =>
    request(server()).delete(`/api/v1/catches/${id}/photo`).set(bearer(token));
  const storedPhotos = async () =>
    readdir(join(UPLOADS_DIR, 'catches')).catch(() => [] as string[]);
  const register = async () =>
    (await request(server()).get('/api/v1/me/catches').set(bearer(angler.accessToken)).expect(200))
      .body as { id: string; photoType: string | null }[];

  beforeEach(async () => {
    // UPLOADS_DIR is one per test file: each test counts only its own photos.
    await rm(join(UPLOADS_DIR, 'catches'), { recursive: true, force: true });
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    for (const target of ['angler', 'other'] as const) {
      const user = await createVerifiedUser(prisma);
      const session = {
        id: user.id,
        email: user.email,
        accessToken: (await login(app, user.email)).accessToken,
      };
      if (target === 'angler') {
        angler = session;
      } else {
        other = session;
      }
    }
    ({ id: waterId } = await createWater(prisma, { name: 'Zalew Zegrzyński' }));
    ({ id: speciesId } = await createSpecies(prisma, { namePl: 'Szczupak' }));
    ({ id: permitId } = await createPermit(prisma, { userId: angler.id, status: 'PAID' }));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('stores, serves as an attachment, replaces and removes the photo within the window', async () => {
    const { id } = await fish();

    const stored = await putPhoto(id, PNG).expect(200);
    expect(stored.body).toMatchObject({ id, photoType: 'image/png', status: 'ACCEPTED' });
    expect(stored.headers['cache-control']).toBe('no-store');
    expect((await register()).map((row) => row.photoType)).toEqual(['image/png']);
    const served = await getPhoto(id).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['content-disposition']).toBe(`attachment; filename="polow-${id}.png"`);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toBe('no-store');
    expect(served.body).toEqual(PNG);

    // A new photo replaces the file; the old one goes.
    const [first] = await storedPhotos();
    await putPhoto(id, PNG).expect(200);
    const after = await storedPhotos();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(first);

    await deletePhoto(id).expect(204);
    expect(await storedPhotos()).toEqual([]);
    await getPhoto(id).expect(404);
    expect((await register()).map((row) => row.photoType)).toEqual([null]);
    // Without a photo the removal answers the same.
    await deletePhoto(id).expect(204);
  });

  it('refuses a PDF, text, a missing file and a too big one', async () => {
    const { id } = await fish();

    const pdf = await putPhoto(id, PDF).expect(400);
    expect((pdf.body as ErrorBody).details?.fields).toHaveProperty('file');
    await putPhoto(id, Buffer.from('not really a picture')).expect(400);
    await request(server())
      .put(`/api/v1/catches/${id}/photo`)
      .set(bearer(angler.accessToken))
      .expect(400);
    const big = Buffer.concat([PNG, Buffer.alloc(CATCH_PHOTO_MAX_BYTES)]);
    expect(((await putPhoto(id, big).expect(413)).body as ErrorBody).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(await storedPhotos()).toEqual([]);
  });

  it('keeps the photo of someone else out of reach', async () => {
    const { id } = await fish();

    await putPhoto(id, PNG, other.accessToken).expect(404);
    await putPhoto(id, PNG).expect(200);
    await getPhoto(id, other.accessToken).expect(404);
    await deletePhoto(id, other.accessToken).expect(404);
    expect(await storedPhotos()).toHaveLength(1);
    await getPhoto('00000000-0000-4000-8000-000000000000').expect(404);
    await getPhoto('not-a-uuid').expect(400);
  });

  it('is closed with the window of the catch (BR-07), for adding and removing alike', async () => {
    // 4 October: the window closed on 5 October at midnight plus 24 h.
    const { id } = await fish({
      caughtAt: new Date('2026-10-04T08:00:00.000Z'),
      photoKey: 'catches/00000000-0000-4000-8000-000000000001.png',
    });

    const refused = await putPhoto(id, PNG).expect(422);
    expect(refused.body).toMatchObject({
      code: 'EDIT_WINDOW_CLOSED',
      details: { editableUntil: '2026-10-05T22:00:00.000Z' },
    });
    await deletePhoto(id).expect(422);
    expect(await storedPhotos()).toEqual([]);
    expect(await prisma.catchRecord.findUniqueOrThrow({ where: { id } })).toMatchObject({
      photoKey: 'catches/00000000-0000-4000-8000-000000000001.png',
    });
  });

  it('goes with the catch when the catch is deleted', async () => {
    const { id } = await fish();
    await putPhoto(id, PNG).expect(200);

    await request(server())
      .delete(`/api/v1/catches/${id}`)
      .set(bearer(angler.accessToken))
      .expect(204);

    expect(await storedPhotos()).toEqual([]);
  });

  it('is removed by the deletion of the account, which counts it', async () => {
    const { id } = await fish();
    const { id: otherId } = await fish({ caughtAt: new Date('2026-10-06T09:00:00.000Z') });
    await putPhoto(id, PNG).expect(200);
    await putPhoto(otherId, PNG).expect(200);
    expect(await storedPhotos()).toHaveLength(2);

    await request(server())
      .delete('/api/v1/me')
      .set(bearer(angler.accessToken))
      .send({ password: PASSWORD })
      .expect(204);

    expect(await storedPhotos()).toEqual([]);
    expect(
      await prisma.catchRecord.findMany({
        where: { userId: angler.id },
        select: { photoKey: true },
      }),
    ).toEqual([{ photoKey: null }, { photoKey: null }]);
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_DELETED' } })).diff,
    ).toMatchObject({ catchPhotos: 2, externalPermitPhotos: 0 });
  });
});
