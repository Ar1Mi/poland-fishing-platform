import { WATERS_LIST_LIMIT } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization, createWater } from './factories';

interface WaterList {
  items: { id: string; name: string }[];
  truncated: boolean;
}

describe('waters catalogue', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;

  const list = (query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/waters').query(query);
  const names = (body: unknown) => (body as WaterList).items.map((water) => water.name);

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

  describe('GET /waters', () => {
    it('lists published waters by name to a guest, with the summary fields only', async () => {
      const water = await createWater(prisma, {
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        lat: 52.46,
        lng: 21.04,
        externalOwnerName: 'RZGW Warszawa',
      });
      await createWater(prisma, { name: 'Jezioro Białe' });
      await createWater(prisma, { name: 'Propozycja rybaka', isPublished: false });

      const response = await list().expect(200);

      expect(names(response.body)).toEqual(['Jezioro Białe', 'Zalew Zegrzyński']);
      expect(response.body).toMatchObject({ truncated: false });
      expect((response.body as WaterList).items[1]).toEqual({
        id: water.id,
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        status: 'UNCLAIMED',
        region: 'mazowieckie',
        lat: 52.46,
        lng: 21.04,
      });
    });

    it('filters by region, type and status', async () => {
      const organization = await createOrganization(prisma, { status: 'ACTIVE' });
      await createWater(prisma, {
        name: 'Podłączone jezioro',
        status: 'CONNECTED',
        organizationId: organization.id,
      });
      await createWater(prisma, { name: 'Wolne jezioro' });
      await createWater(prisma, { name: 'Rzeka', type: 'RIVER' });
      await createWater(prisma, { name: 'Jezioro na Pomorzu', region: 'pomorskie' });

      expect(names((await list({ status: 'CONNECTED' }).expect(200)).body)).toEqual([
        'Podłączone jezioro',
      ]);
      expect(names((await list({ type: 'RIVER' }).expect(200)).body)).toEqual(['Rzeka']);
      expect(names((await list({ region: 'pomorskie' }).expect(200)).body)).toEqual([
        'Jezioro na Pomorzu',
      ]);
      expect(
        names((await list({ region: 'mazowieckie', type: 'LAKE', status: 'UNCLAIMED' })).body),
      ).toEqual(['Wolne jezioro']);
    });

    it('searches a part of the name regardless of case', async () => {
      await createWater(prisma, { name: 'Zalew Zegrzyński' });
      await createWater(prisma, { name: 'Jezioro Zegrzyńskie Małe' });
      await createWater(prisma, { name: 'Wisła' });

      const response = await list({ q: '  ZEGRZ ' }).expect(200);

      expect(names(response.body)).toEqual(['Jezioro Zegrzyńskie Małe', 'Zalew Zegrzyński']);
    });

    it('treats LIKE wildcards in the search as plain characters', async () => {
      await createWater(prisma, { name: 'Staw 100% naturalny' });
      await createWater(prisma, { name: 'Staw 100 lat' });

      expect(names((await list({ q: '100%' }).expect(200)).body)).toEqual(['Staw 100% naturalny']);
      expect(names((await list({ q: '_' }).expect(200)).body)).toEqual([]);
    });

    it('returns only waters inside the bbox, edges included, and none without coordinates', async () => {
      await createWater(prisma, { name: 'W środku', lat: 52.2, lng: 21 });
      await createWater(prisma, { name: 'Na krawędzi', lat: 52.5, lng: 21.5 });
      await createWater(prisma, { name: 'Poza', lat: 54.4, lng: 18.6 });
      await createWater(prisma, { name: 'Bez współrzędnych' });

      const response = await list({ bbox: '20.5,52,21.5,52.5' }).expect(200);

      expect(names(response.body)).toEqual(['Na krawędzi', 'W środku']);
    });

    it('includes waters without coordinates when no bbox is given (for the list)', async () => {
      await createWater(prisma, { name: 'Bez współrzędnych' });

      expect(names((await list().expect(200)).body)).toEqual(['Bez współrzędnych']);
    });

    it(`returns at most ${WATERS_LIST_LIMIT} waters and says the list was truncated`, async () => {
      const rows = Array.from({ length: WATERS_LIST_LIMIT + 1 }, (_, i) => ({
        name: `Staw ${String(i).padStart(4, '0')}`,
        type: 'POND' as const,
        region: 'mazowieckie',
        source: 'MANUAL' as const,
        sourceRef: `bulk-${i}`,
      }));
      await prisma.fishingWater.createMany({ data: rows });

      const response = await list().expect(200);

      const body = response.body as WaterList;
      expect(body.truncated).toBe(true);
      expect(body.items).toHaveLength(WATERS_LIST_LIMIT);
      expect(body.items.at(-1)?.name).toBe(
        `Staw ${String(WATERS_LIST_LIMIT - 1).padStart(4, '0')}`,
      );
    });

    it('is not truncated at exactly the limit', async () => {
      const rows = Array.from({ length: WATERS_LIST_LIMIT }, (_, i) => ({
        name: `Staw ${i}`,
        type: 'POND' as const,
        region: 'mazowieckie',
        source: 'MANUAL' as const,
        sourceRef: `bulk-${i}`,
      }));
      await prisma.fishingWater.createMany({ data: rows });

      const body = (await list().expect(200)).body as WaterList;

      expect(body.truncated).toBe(false);
      expect(body.items).toHaveLength(WATERS_LIST_LIMIT);
    });

    it.each([
      ['an unknown region', { region: 'mazowsze' }, 'region'],
      ['a region not in lower case', { region: 'Mazowieckie' }, 'region'],
      ['an unknown type', { type: 'SEA' }, 'type'],
      ['an unknown status', { status: 'PENDING' }, 'status'],
      ['an empty search', { q: '   ' }, 'q'],
      ['a too long search', { q: 'a'.repeat(101) }, 'q'],
      ['a bbox with three numbers', { bbox: '20,52,21' }, 'bbox'],
      ['a bbox with min above max', { bbox: '22,52,21,53' }, 'bbox'],
      ['a bbox out of range', { bbox: '20,52,21,95' }, 'bbox'],
    ])('rejects %s', async (_name, query, field) => {
      const response = await list(query).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { [field]: [expect.any(String)] } },
      });
    });

    it('rejects an unknown query parameter', async () => {
      const response = await list({ page: '2' }).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('GET /waters/:id', () => {
    it('shows an unclaimed water with its użytkownik rybacki and link', async () => {
      const water = await createWater(prisma, {
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        lat: 52.46,
        lng: 21.04,
        description: 'Zbiornik na Narwi',
        source: 'RZGW',
        externalOwnerName: 'RZGW Warszawa',
        externalInfoUrl: 'https://www.gov.pl/web/wody-polskie',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/waters/${water.id}`)
        .expect(200);

      expect(response.body).toEqual({
        id: water.id,
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        status: 'UNCLAIMED',
        region: 'mazowieckie',
        lat: 52.46,
        lng: 21.04,
        description: 'Zbiornik na Narwi',
        organization: null,
        externalOwnerName: 'RZGW Warszawa',
        externalInfoUrl: 'https://www.gov.pl/web/wody-polskie',
        source: 'RZGW',
        updatedAt: water.updatedAt.toISOString(),
      });
    });

    it('shows the organization of a connected water, without its private data', async () => {
      const organization = await createOrganization(prisma, {
        name: 'Koło PZW nr 12',
        status: 'ACTIVE',
      });
      const water = await createWater(prisma, {
        status: 'CONNECTED',
        organizationId: organization.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/waters/${water.id}`)
        .expect(200);

      expect(response.body).toMatchObject({ status: 'CONNECTED' });
      expect((response.body as { organization: object }).organization).toEqual({
        id: organization.id,
        name: 'Koło PZW nr 12',
        isActive: true,
      });
    });

    it.each(['BLOCKED', 'PENDING'] as const)(
      'marks the organization of a connected water as inactive when it is %s',
      async (status) => {
        const organization = await createOrganization(prisma, { status });
        const water = await createWater(prisma, {
          status: 'CONNECTED',
          organizationId: organization.id,
        });

        const response = await request(app.getHttpServer())
          .get(`/api/v1/waters/${water.id}`)
          .expect(200);

        // The water stays CONNECTED (the claim was approved); only online sales are suspended.
        expect(response.body).toMatchObject({
          status: 'CONNECTED',
          organization: { id: organization.id, isActive: false },
        });
      },
    );

    it('answers 404 for an unpublished suggestion', async () => {
      const water = await createWater(prisma, { isPublished: false });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/waters/${water.id}`)
        .expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('answers 404 for an unknown id and 400 for one that is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/waters/6f1c2c55-3b1e-4a43-9a51-0d6c2f0d9a11')
        .expect(404);
      const response = await request(app.getHttpServer())
        .get('/api/v1/waters/not-a-uuid')
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});
