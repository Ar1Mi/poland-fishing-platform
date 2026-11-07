import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  WATER_DESCRIPTION_MAX_LENGTH,
  WATER_PHOTO_MAX_BYTES,
  WATER_SEASON_INFO_MAX_LENGTH,
} from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createWater } from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const UPLOADS_DIR = process.env.UPLOADS_DIR!;

interface WaterCard {
  id: string;
  description: string | null;
  seasonInfo: string | null;
  photoVersion: string | null;
  importedAt: string | null;
}

/** Collects a binary body instead of parsing it. */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('water profile of an organization (FR-05)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let admin: OrgMember;
  let waterId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const patch = (body: Record<string, unknown>, id = waterId, member = admin) =>
    request(server())
      .patch(`/api/v1/orgs/${member.organizationId}/waters/${id}`)
      .set(bearer(member.accessToken))
      .send(body);
  const putPhoto = (file: Buffer, id = waterId, member = admin) =>
    request(server())
      .put(`/api/v1/orgs/${member.organizationId}/waters/${id}/photo`)
      .set(bearer(member.accessToken))
      .attach('file', file, { filename: 'staw.png', contentType: 'image/png' });
  const storedPhotos = async () => readdir(join(UPLOADS_DIR, 'waters')).catch(() => [] as string[]);

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    ({ id: waterId } = await createWater(prisma, {
      status: 'CONNECTED',
      organizationId: admin.organizationId,
      description: 'Stary opis',
      importedAt: new Date('2026-01-02T10:00:00.000Z'),
    }));
    await rm(join(UPLOADS_DIR, 'waters'), { recursive: true, force: true });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('GET /orgs/:orgId/waters/:id', () => {
    it('reads the card of an own water for its form, never from a cache', async () => {
      const response = await request(server())
        .get(`/api/v1/orgs/${admin.organizationId}/waters/${waterId}`)
        .set(bearer(admin.accessToken))
        .expect(200);

      expect(response.body).toMatchObject({ id: waterId, description: 'Stary opis' });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('treats a water of another organization as unknown', async () => {
      const foreign = await loginOrgMember(app, prisma, 'ORG_ADMIN');

      await request(server())
        .get(`/api/v1/orgs/${foreign.organizationId}/waters/${waterId}`)
        .set(bearer(foreign.accessToken))
        .expect(404);
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/waters/${waterId}`).set(bearer(token)),
      );
    });
  });

  describe('PATCH /orgs/:orgId/waters/:id', () => {
    it('changes the description and the season, trimmed, and logs who changed what', async () => {
      const response = await patch({
        description: '  Staw z pomostami  ',
        seasonInfo: '1 V – 30 IX, 6:00–22:00',
      }).expect(200);

      expect(response.body).toMatchObject({
        id: waterId,
        description: 'Staw z pomostami',
        seasonInfo: '1 V – 30 IX, 6:00–22:00',
        photoVersion: null,
        // The edit is not an import: the date of the catalogue data stays.
        importedAt: '2026-01-02T10:00:00.000Z',
      });
      const card = await request(server()).get(`/api/v1/waters/${waterId}`).expect(200);
      expect(card.body).toMatchObject({ seasonInfo: '1 V – 30 IX, 6:00–22:00' });
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          action: 'WATER_PROFILE_UPDATED',
          entity: 'FishingWater',
          entityId: waterId,
          diff: {
            organizationId: admin.organizationId,
            description: { from: 'Stary opis', to: 'Staw z pomostami' },
            seasonInfo: { from: null, to: '1 V – 30 IX, 6:00–22:00' },
          },
        }),
      ]);
    });

    it('keeps a field that is not sent and clears one sent blank or null', async () => {
      await patch({ seasonInfo: 'Cały rok' }).expect(200);

      const blank = await patch({ description: '   ' }).expect(200);
      expect(blank.body).toMatchObject({ description: null, seasonInfo: 'Cały rok' });
      const cleared = await patch({ seasonInfo: null }).expect(200);
      expect(cleared.body).toMatchObject({ description: null, seasonInfo: null });
    });

    it('writes nothing when nothing changes', async () => {
      await patch({ description: 'Stary opis' }).expect(200);

      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('accepts the longest texts and refuses longer ones and other fields', async () => {
      await patch({
        description: 'a'.repeat(WATER_DESCRIPTION_MAX_LENGTH),
        seasonInfo: 'b'.repeat(WATER_SEASON_INFO_MAX_LENGTH),
      }).expect(200);

      const long = await patch({ seasonInfo: 'b'.repeat(WATER_SEASON_INFO_MAX_LENGTH + 1) }).expect(
        400,
      );
      expect(long.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { seasonInfo: expect.any(Array) as unknown } },
      });
      // The catalogue fields belong to the import.
      await patch({ name: 'Nowa nazwa' }).expect(400);
      await patch({ description: 7 }).expect(400);
    });

    it('treats a water of another organization or an unconnected one as unknown', async () => {
      const unclaimed = await createWater(prisma);
      const foreign = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      const foreignWater = await createWater(prisma, {
        status: 'CONNECTED',
        organizationId: foreign.organizationId,
      });

      for (const id of [unclaimed.id, foreignWater.id, '00000000-0000-4000-8000-000000000000']) {
        const response = await patch({ description: 'Mój' }, id).expect(404);
        expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
      }
      await patch({ description: 'Mój' }, 'not-a-uuid').expect(400);
      expect(
        (await prisma.fishingWater.findUniqueOrThrow({ where: { id: foreignWater.id } }))
          .description,
      ).toBeNull();
    });

    it('is for the admins of the organization', async () => {
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');
      await request(server())
        .patch(`/api/v1/orgs/${inspector.organizationId}/waters/${waterId}`)
        .set(bearer(inspector.accessToken))
        .send({ description: 'x' })
        .expect(403);
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .patch(`/api/v1/orgs/${orgId}/waters/${waterId}`)
          .set(bearer(token))
          .send({ description: 'x' }),
      );
      await request(server())
        .patch(`/api/v1/orgs/${admin.organizationId}/waters/${waterId}`)
        .send({ description: 'x' })
        .expect(401);
    });
  });

  describe('photo', () => {
    it('stores a photo that the public card links and serves', async () => {
      const stored = await putPhoto(PNG).expect(200);

      const { photoVersion } = stored.body as WaterCard;
      expect(photoVersion).toMatch(/^[0-9a-f-]{36}$/);
      expect(await storedPhotos()).toEqual([`${photoVersion}.png`]);
      const card = await request(server()).get(`/api/v1/waters/${waterId}`).expect(200);
      expect(card.body).toMatchObject({ photoVersion });
      const served = await request(server())
        .get(`/api/v1/waters/${waterId}/photo?v=${photoVersion}`)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['content-disposition']).toBe(
        `attachment; filename="lowisko-${waterId}.png"`,
      );
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['cache-control']).toBe('public, max-age=86400');
      expect(served.body).toEqual(PNG);
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          action: 'WATER_PHOTO_SET',
          entityId: waterId,
          diff: { organizationId: admin.organizationId, replaced: false, type: 'image/png' },
        }),
      ]);
    });

    it('replaces the photo with a new version and removes the old file', async () => {
      const first = (await putPhoto(PNG).expect(200)).body as WaterCard;
      const second = (await putPhoto(JPEG).expect(200)).body as WaterCard;

      expect(second.photoVersion).not.toBe(first.photoVersion);
      expect(await storedPhotos()).toEqual([`${second.photoVersion}.jpg`]);
      const served = await request(server()).get(`/api/v1/waters/${waterId}/photo`).expect(200);
      expect(served.headers['content-type']).toBe('image/jpeg');
    });

    it('removes the photo and its file', async () => {
      await putPhoto(PNG).expect(200);

      const removed = await request(server())
        .delete(`/api/v1/orgs/${admin.organizationId}/waters/${waterId}/photo`)
        .set(bearer(admin.accessToken))
        .expect(200);

      // The client takes this card instead of reading one the PWA may have cached.
      expect(removed.body).toMatchObject({ id: waterId, photoVersion: null });
      expect(await storedPhotos()).toEqual([]);
      const card = await request(server()).get(`/api/v1/waters/${waterId}`).expect(200);
      expect(card.body).toMatchObject({ photoVersion: null });
      await request(server()).get(`/api/v1/waters/${waterId}/photo`).expect(404);
      expect((await prisma.auditLog.findMany()).map((entry) => entry.action)).toEqual([
        'WATER_PHOTO_SET',
        'WATER_PHOTO_DELETED',
      ]);
    });

    it('refuses a PDF or an unknown file by its content, a missing file and a big one', async () => {
      for (const file of [PDF, Buffer.from('not an image')]) {
        const response = await putPhoto(file).expect(400);
        expect(response.body).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: { fields: { file: expect.any(Array) as unknown } },
        });
      }
      await request(server())
        .put(`/api/v1/orgs/${admin.organizationId}/waters/${waterId}/photo`)
        .set(bearer(admin.accessToken))
        .expect(400);
      const big = Buffer.concat([PNG, Buffer.alloc(WATER_PHOTO_MAX_BYTES)]);
      await putPhoto(big).expect(413);
      expect(await storedPhotos()).toEqual([]);
    });

    it('is not served for a water without a photo, an unpublished one or a missing file', async () => {
      const missing = await request(server()).get(`/api/v1/waters/${waterId}/photo`).expect(404);
      // Only a served photo may be kept by browsers and proxies, never the error.
      expect(missing.headers['cache-control'] ?? '').not.toMatch(/public/);
      const hidden = await createWater(prisma, {
        isPublished: false,
        photoKey: 'waters/00000000-0000-4000-8000-000000000002.png',
      });
      await request(server()).get(`/api/v1/waters/${hidden.id}/photo`).expect(404);
      await prisma.fishingWater.update({
        where: { id: waterId },
        data: { photoKey: 'waters/00000000-0000-4000-8000-000000000003.png' },
      });
      await request(server()).get(`/api/v1/waters/${waterId}/photo`).expect(404);
      await request(server()).get('/api/v1/waters/not-a-uuid/photo').expect(400);
    });

    it('takes no photo for a water of another organization', async () => {
      const foreign = await loginOrgMember(app, prisma, 'ORG_ADMIN');

      await putPhoto(PNG, waterId, foreign).expect(404);
      await request(server())
        .delete(`/api/v1/orgs/${foreign.organizationId}/waters/${waterId}/photo`)
        .set(bearer(foreign.accessToken))
        .expect(404);
      expect(await storedPhotos()).toEqual([]);
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .put(`/api/v1/orgs/${orgId}/waters/${waterId}/photo`)
          .set(bearer(token))
          .attach('file', PNG, { filename: 'staw.png', contentType: 'image/png' }),
      );
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .delete(`/api/v1/orgs/${orgId}/waters/${waterId}/photo`)
          .set(bearer(token)),
      );
    });
  });
});
