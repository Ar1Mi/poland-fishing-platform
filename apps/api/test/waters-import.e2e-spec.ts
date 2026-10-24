import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { WATER_IMPORT_MAX_BYTES } from '../src/modules/waters/waters.controller';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization, createWater } from './factories';
import { FakeGeocoder } from './geocoding/fake-geocoder';

const HEADER =
  'source,sourceRef,name,type,region,externalOwnerName,externalInfoUrl,lat,lng,geocodeQuery';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

interface Report {
  created: number;
  updated: number;
  failed: { row: number; error: string }[];
}

describe('POST /admin/waters/import', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let geocoder: FakeGeocoder;
  let superAdminToken: string;
  let userToken: string;

  const upload = (content: string | Buffer, token = superAdminToken) =>
    request(app.getHttpServer())
      .post('/api/v1/admin/waters/import')
      .set({ Authorization: `Bearer ${token}` })
      .attach('file', Buffer.from(content), { filename: 'waters.csv', contentType: 'text/csv' });

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    geocoder = new FakeGeocoder({
      'zalew zegrzyński, mazowieckie': { lat: 52.4875, lng: 21.0102 },
    });
    app = await createTestApp({ prisma, geocoder });
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    ({ accessToken: superAdminToken } = await login(app, superAdmin.email));
    const user = await createVerifiedUser(prisma);
    ({ accessToken: userToken } = await login(app, user.email));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('creates UNCLAIMED published waters, geocoding rows without coordinates', async () => {
    const response = await upload(
      csv(
        'RZGW,WA-123,Zalew Zegrzyński,RESERVOIR,mazowieckie,RZGW Warszawa,https://wody.example/wa-123,,,"Zalew Zegrzyński, mazowieckie"',
        'PZW,MAZ-7,Jezioro Białe,LAKE,mazowieckie,,,52.6012,19.5123,',
      ),
    ).expect(200);

    expect(response.body).toEqual({ created: 2, updated: 0, failed: [] });
    const waters = await prisma.fishingWater.findMany({ orderBy: { sourceRef: 'asc' } });
    expect(waters).toEqual([
      expect.objectContaining({
        sourceRef: 'MAZ-7',
        source: 'PZW',
        lat: 52.6012,
        lng: 19.5123,
        externalOwnerName: null,
        externalInfoUrl: null,
      }),
      expect.objectContaining({
        sourceRef: 'WA-123',
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        region: 'mazowieckie',
        lat: 52.4875,
        lng: 21.0102,
        status: 'UNCLAIMED',
        isPublished: true,
        externalOwnerName: 'RZGW Warszawa',
        externalInfoUrl: 'https://wody.example/wa-123',
      }),
    ]);
    expect(geocoder.queries).toEqual(['zalew zegrzyński, mazowieckie']);
  });

  it('updates catalogue fields on re-import and keeps what the platform owns', async () => {
    const organization = await createOrganization(prisma, { status: 'ACTIVE' });
    const water = await createWater(prisma, {
      source: 'RZGW',
      sourceRef: 'WA-123',
      name: 'Stara nazwa',
      externalOwnerName: 'Stary właściciel',
      status: 'CONNECTED',
      organizationId: organization.id,
      description: 'Opis koła',
    });

    const response = await upload(
      csv('RZGW,WA-123,Zalew Zegrzyński,RESERVOIR,mazowieckie,,,52.49,21.01,'),
    ).expect(200);

    expect(response.body).toEqual({ created: 0, updated: 1, failed: [] });
    expect(await prisma.fishingWater.findMany()).toEqual([
      expect.objectContaining({
        id: water.id,
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        externalOwnerName: null,
        lat: 52.49,
        status: 'CONNECTED',
        organizationId: organization.id,
        description: 'Opis koła',
      }),
    ]);
  });

  it('treats the same sourceRef from another source as another water', async () => {
    await createWater(prisma, { source: 'RZGW', sourceRef: '7' });

    const response = await upload(csv('PZW,7,Staw,POND,mazowieckie,,,52,21,')).expect(200);

    expect(response.body).toEqual({ created: 1, updated: 0, failed: [] });
  });

  it('reports bad rows by number and imports the rest', async () => {
    const response = await upload(
      csv(
        'RZGW,A,Dobry,LAKE,mazowieckie,,,52,21,',
        'RZGW,B,Zły region,LAKE,Mazowsze,,,52,21,',
        'RZGW,C,Zły link,LAKE,mazowieckie,,javascript:alert(1),52,21,',
        'RZGW,A,Duplikat,LAKE,mazowieckie,,,52,21,',
        'RZGW,D,Nieznany,LAKE,mazowieckie,,,,,Nieznane miejsce',
        'RZGW,E',
      ),
    ).expect(200);

    const report = response.body as Report;
    expect(report.created).toBe(1);
    expect(report.updated).toBe(0);
    expect(report.failed).toEqual([
      { row: 3, error: expect.stringContaining('region: must be a voivodeship') as unknown },
      { row: 4, error: 'externalInfoUrl: must be an http(s) URL' },
      { row: 5, error: 'source+sourceRef already used in row 2' },
      { row: 6, error: 'geocodeQuery: no place found for "Nieznane miejsce"' },
      { row: 7, error: 'expected 10 fields, got 2' },
    ]);
    expect(await prisma.fishingWater.count()).toBe(1);
  });

  it('asks the geocoder once per query and caches "not found" too', async () => {
    const rows = csv(
      'RZGW,A,Zalew,RESERVOIR,mazowieckie,,,,,"Zalew Zegrzyński, mazowieckie"',
      'RZGW,B,Nieznany,LAKE,mazowieckie,,,,,Nieznane miejsce',
    );

    await upload(rows).expect(200);
    const second = await upload(rows.replace('Nieznane miejsce', '  NIEZNANE   miejsce ')).expect(
      200,
    );

    expect((second.body as Report).updated).toBe(1);
    expect(geocoder.queries).toEqual(['zalew zegrzyński, mazowieckie', 'nieznane miejsce']);
    expect(await prisma.geocodeCache.findMany({ orderBy: { query: 'asc' } })).toEqual([
      expect.objectContaining({ query: 'nieznane miejsce', lat: null, lng: null }),
      expect.objectContaining({
        query: 'zalew zegrzyński, mazowieckie',
        lat: 52.4875,
        lng: 21.0102,
      }),
    ]);
  });

  it('fails rows when the geocoder is unavailable and does not cache the outage', async () => {
    geocoder.unavailable = true;
    const rows = csv('RZGW,A,Zalew,RESERVOIR,mazowieckie,,,,,"Zalew Zegrzyński, mazowieckie"');

    const response = await upload(rows).expect(200);

    expect(response.body).toEqual({
      created: 0,
      updated: 0,
      failed: [{ row: 2, error: 'geocodeQuery: geocoder answered HTTP 503' }],
    });
    expect(await prisma.geocodeCache.count()).toBe(0);

    geocoder.unavailable = false;
    expect((await upload(rows).expect(200)).body).toMatchObject({ created: 1 });
  });

  it.each([
    ['a wrong header', 'name,region\nJezioro,mazowieckie', 'invalid header'],
    ['an empty file', '', 'the file is empty'],
    ['a broken quote', `${HEADER}\nRZGW,"A,Jezioro`, 'not a valid CSV'],
  ])('rejects %s as a whole with 400', async (_case, content, message) => {
    const response = await upload(content).expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining(message) as unknown,
    });
    expect(await prisma.fishingWater.count()).toBe(0);
  });

  it('rejects a request without a file', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/waters/import')
      .set({ Authorization: `Bearer ${superAdminToken}` })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { file: 'is required' },
    });
  });

  it('rejects a file over 1 MB', async () => {
    const response = await upload(Buffer.alloc(WATER_IMPORT_MAX_BYTES + 1, 'a')).expect(413);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('is for super admins only', async () => {
    const response = await upload(csv('RZGW,A,Staw,POND,mazowieckie,,,52,21,'), userToken).expect(
      403,
    );

    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(await prisma.fishingWater.count()).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/waters/import')
      .attach('file', Buffer.from(HEADER), 'waters.csv')
      .expect(401);
  });
});
