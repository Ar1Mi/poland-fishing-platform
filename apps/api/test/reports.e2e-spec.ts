import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createExternalPermit,
  createPermit,
  createPermitType,
  createSpecies,
  createUser,
  createWater,
} from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

interface OrgStats {
  from: string;
  to: string;
  sales: {
    count: number;
    revenueGrosze: number;
    revokedCount: number;
    revokedGrosze: number;
    byPermitType: {
      permitType: { id: string; name: string };
      count: number;
      revenueGrosze: number;
      revokedCount: number;
    }[];
    byMonth: { month: string; count: number; revenueGrosze: number }[];
  };
  catches: {
    count: number;
    keptCount: number;
    releasedCount: number;
    bySpecies: { speciesId: string; count: number; keptCount: number }[];
    byWater: { water: { id: string; name: string }; count: number; keptCount: number }[];
  };
}

interface ErrorBody {
  code: string;
  details: { fields: Record<string, string[]> };
}

/** The body as UTF-8 text, BOM included: supertest leaves `text/csv` unparsed. */
const textParser = (res: request.Response, done: (error: Error | null, body: string) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
};

// FIXED_NOW is 2026-10-06 17:20 in Warsaw: the default period is the season 2026.
describe('statistics and catch export of an organization (FR-19)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let admin: OrgMember;
  let dailyId: string;
  let yearlyId: string;
  let anglerId: string;
  let zegrzeId: string;
  let pikeId: string;
  let perchId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, query: Record<string, string> = {}, member = admin) =>
    request(server())
      .get(`/api/v1/orgs/${member.organizationId}/${path}`)
      .query(query)
      .set(bearer(member.accessToken));
  const stats = async (query: Record<string, string> = {}) =>
    (await get('stats', query).expect(200)).body as OrgStats;
  const csv = async (query: Record<string, string> = {}) =>
    (await get('catches.csv', query).buffer(true).parse(textParser).expect(200)).body as string;
  /** A permit of the organization's daily type, paid unless said otherwise. */
  const permit = (data: Record<string, unknown> = {}) =>
    createPermit(prisma, {
      permitTypeId: dailyId,
      userId: anglerId,
      status: 'PAID',
      createdAt: new Date('2026-10-06T08:00:00.000Z'),
      ...data,
    });
  const fish = (permitId: string, data: Record<string, unknown> = {}) =>
    createCatch(prisma, {
      userId: anglerId,
      permitId,
      fishingWaterId: zegrzeId,
      speciesId: pikeId,
      ...data,
    });

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    ({ id: zegrzeId } = await createWater(prisma, {
      name: 'Zalew Zegrzyński',
      status: 'CONNECTED',
      organizationId: admin.organizationId,
    }));
    ({ id: dailyId } = await createPermitType(prisma, {
      organizationId: admin.organizationId,
      name: 'Dzienne',
      waters: { connect: [{ id: zegrzeId }] },
    }));
    ({ id: yearlyId } = await createPermitType(prisma, {
      organizationId: admin.organizationId,
      name: 'Roczne',
      durationDays: 365,
      priceGrosze: 30000,
      waters: { connect: [{ id: zegrzeId }] },
    }));
    ({ id: anglerId } = await createUser(prisma, { firstName: 'Jan', lastName: 'Kowalski' }));
    ({ id: pikeId } = await createSpecies(prisma, { namePl: 'Szczupak' }));
    ({ id: perchId } = await createSpecies(prisma, { namePl: 'Okoń' }));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('GET /orgs/:orgId/stats', () => {
    it('counts paid and revoked permits of the organization as sales, by type and month', async () => {
      await permit({ pricePaidGrosze: 2500 });
      await permit({ pricePaidGrosze: 2000, createdAt: new Date('2026-03-10T08:00:00.000Z') });
      await permit({
        status: 'REVOKED',
        revokedAt: new Date('2026-10-06T09:00:00.000Z'),
        revokeReason: 'Zwrot',
      });
      await permit({ permitTypeId: yearlyId, pricePaidGrosze: 30000 });
      // Not sales: not paid, cancelled, another organization's type.
      await permit({ status: 'PENDING_PAYMENT' });
      await permit({ status: 'CANCELLED' });
      await createPermit(prisma, {
        status: 'PAID',
        pricePaidGrosze: 99900,
        createdAt: new Date('2026-10-06T08:00:00.000Z'),
      });

      const { from, to, sales } = await stats();

      expect({ from, to }).toEqual({ from: '2026-01-01', to: '2026-12-31' });
      expect(sales).toMatchObject({
        count: 4,
        revenueGrosze: 37000,
        revokedCount: 1,
        revokedGrosze: 2500,
      });
      expect(sales.byPermitType).toEqual([
        {
          permitType: { id: yearlyId, name: 'Roczne' },
          count: 1,
          revenueGrosze: 30000,
          revokedCount: 0,
        },
        {
          permitType: { id: dailyId, name: 'Dzienne' },
          count: 3,
          revenueGrosze: 7000,
          revokedCount: 1,
        },
      ]);
      expect(sales.byMonth).toHaveLength(12);
      expect(sales.byMonth[2]).toEqual({ month: '2026-03', count: 1, revenueGrosze: 2000 });
      expect(sales.byMonth[9]).toEqual({ month: '2026-10', count: 3, revenueGrosze: 35000 });
    });

    it('takes the period by the Warsaw day of purchase', async () => {
      // October starts in summer time (UTC+2) and ends in winter time (UTC+1, since 25 October).
      await permit({ createdAt: new Date('2026-09-30T21:59:59.999Z') }); // 30.09 23:59:59
      await permit({ createdAt: new Date('2026-09-30T22:00:00.000Z') }); // 1.10 00:00
      await permit({ createdAt: new Date('2026-10-31T22:59:59.999Z') }); // 31.10 23:59:59
      await permit({ createdAt: new Date('2026-10-31T23:00:00.000Z') }); // 1.11 00:00

      const { sales } = await stats({ from: '2026-10-01', to: '2026-10-31' });

      expect(sales.count).toBe(2);
      expect(sales.byMonth).toEqual([{ month: '2026-10', count: 2, revenueGrosze: 5000 }]);
    });

    it('counts accepted catches on the organization permits by species and water', async () => {
      const lake = await createWater(prisma, {
        name: 'Jezioro Białe',
        status: 'CONNECTED',
        organizationId: admin.organizationId,
      });
      const { id: permitId } = await permit({
        status: 'REVOKED',
        revokedAt: new Date('2026-10-06T09:00:00.000Z'),
      });
      await fish(permitId);
      await fish(permitId);
      await fish(permitId, { kept: false });
      await fish(permitId, { speciesId: perchId, fishingWaterId: lake.id, kept: false });
      await fish(permitId, { speciesId: perchId, fishingWaterId: lake.id, kept: false });
      // Not counted: rejected, on another organization's permit, on its own permit never paid,
      // on an external permit (even on the organization's water), outside the period.
      await fish(permitId, { syncStatus: 'REJECTED', violations: [] });
      const foreign = await createPermit(prisma, { userId: anglerId, status: 'PAID' });
      await fish(foreign.id);
      const unpaid = await permit({ status: 'PENDING_PAYMENT' });
      await fish(unpaid.id);
      const external = await createExternalPermit(prisma, { userId: anglerId });
      await fish('', { permitId: null, externalPermitId: external.id });
      await fish(permitId, { caughtAt: new Date('2025-12-31T22:59:59.999Z') });

      const { catches } = await stats();

      expect(catches).toMatchObject({ count: 5, keptCount: 2, releasedCount: 3 });
      expect(catches.bySpecies).toEqual([
        { speciesId: pikeId, count: 3, keptCount: 2 },
        { speciesId: perchId, count: 2, keptCount: 0 },
      ]);
      expect(catches.byWater).toEqual([
        { water: { id: zegrzeId, name: 'Zalew Zegrzyński' }, count: 3, keptCount: 2 },
        { water: { id: lake.id, name: 'Jezioro Białe' }, count: 2, keptCount: 0 },
      ]);
    });

    it('takes catches by the Warsaw day they were caught on', async () => {
      const { id: permitId } = await permit();
      // 1 January 00:30 in Warsaw is still 31 December in UTC.
      await fish(permitId, { caughtAt: new Date('2025-12-31T23:30:00.000Z') });
      await fish(permitId, { caughtAt: new Date('2025-12-31T22:30:00.000Z') });

      const { catches } = await stats({ from: '2026-01-01', to: '2026-01-31' });

      expect(catches.count).toBe(1);
    });

    it('answers zeros for a period without sales and catches', async () => {
      const result = await stats({ from: '2026-10-06', to: '2026-10-06' });

      expect(result).toEqual({
        from: '2026-10-06',
        to: '2026-10-06',
        sales: {
          count: 0,
          revenueGrosze: 0,
          revokedCount: 0,
          revokedGrosze: 0,
          byPermitType: [],
          byMonth: [{ month: '2026-10', count: 0, revenueGrosze: 0 }],
        },
        catches: { count: 0, keptCount: 0, releasedCount: 0, bySpecies: [], byWater: [] },
      });
    });

    it.each([
      [{ from: '2026-01-01' }, 'to'],
      [{ to: '2026-12-31' }, 'from'],
      [{ from: '2026-02-30', to: '2026-03-01' }, 'from'],
      [{ from: '2026-10-06', to: '2026-10-05' }, 'to'],
      [{ from: '2026-01-01', to: '2027-01-02' }, 'to'],
      [{ from: '1999-12-31', to: '2000-01-01' }, 'to'],
    ])('rejects the period %j on %s', async (query, field) => {
      const body = (await get('stats', query).expect(400)).body as ErrorBody;

      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(body.details.fields)).toEqual([field]);
    });

    it('accepts a whole leap year', async () => {
      await get('stats', { from: '2028-01-01', to: '2028-12-31' }).expect(200);
    });

    it('is closed to an inspector of the organization', async () => {
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');

      const body = (await get('stats', {}, inspector).expect(403)).body as ErrorBody;

      expect(body.code).toBe('FORBIDDEN');
    });

    it('is closed to the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/stats`).set(bearer(token)),
      );
    });
  });

  describe('GET /orgs/:orgId/catches.csv', () => {
    it('is a Polish CSV attachment that no cache keeps', async () => {
      const response = await get('catches.csv', { from: '2026-10-01', to: '2026-10-31' })
        .buffer(true)
        .parse(textParser)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="polowy-2026-10-01-2026-10-31.csv"',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toBe(
        '\uFEFFData;Godzina;Numer zezwolenia;Łowisko;Gatunek;Długość (cm);Waga (g);Ryba;' +
          'Status;Naruszenia\r\n',
      );
    });

    it('lists accepted and rejected catches on the organization permits, earliest first', async () => {
      const { id: permitId } = await permit({ number: 'ZW-2026-000123' });
      await fish(permitId, {
        caughtAt: new Date('2026-10-06T15:20:00.000Z'),
        lengthCm: 62,
        weightG: null,
        kept: false,
      });
      await fish(permitId, {
        caughtAt: new Date('2026-10-06T06:05:00.000Z'),
        speciesId: perchId,
        lengthCm: 12,
        weightG: 150,
        syncStatus: 'REJECTED',
        violations: [{ ruleId: 'BR-02', code: 'BELOW_MIN_LENGTH', details: { minLengthCm: 15 } }],
      });
      // Left out: another organization's permit, its own permit whose payment was cancelled (a
      // catch synced on it is rejected, but the organization sold nothing), an external permit.
      const foreign = await createPermit(prisma, { userId: anglerId, status: 'PAID' });
      await fish(foreign.id);
      const cancelled = await permit({ status: 'CANCELLED', number: 'ZW-2026-000124' });
      await fish(cancelled.id, {
        syncStatus: 'REJECTED',
        violations: [{ ruleId: 'BR-01', code: 'PERMIT_NOT_ACTIVE', details: {} }],
      });
      const external = await createExternalPermit(prisma, { userId: anglerId });
      await fish('', { permitId: null, externalPermitId: external.id });

      const body = await csv();

      expect(body.split('\r\n').slice(1)).toEqual([
        '2026-10-06;08:05;ZW-2026-000123;Zalew Zegrzyński;Okoń;12;150;zabrana;odrzucony;' +
          'poniżej wymiaru ochronnego (BR-02)',
        '2026-10-06;17:20;ZW-2026-000123;Zalew Zegrzyński;Szczupak;62;;wypuszczona;przyjęty;',
        '',
      ]);
      expect(body).not.toContain('Kowalski');
    });

    it('takes catches by the Warsaw day they were caught on', async () => {
      const { id: permitId } = await permit();
      // 1 November 00:00 in Warsaw (winter time) is 31 October 23:00 UTC.
      await fish(permitId, { caughtAt: new Date('2026-10-31T22:59:59.999Z'), lengthCm: 40 });
      await fish(permitId, { caughtAt: new Date('2026-10-31T23:00:00.000Z'), lengthCm: 41 });

      const body = await csv({ from: '2026-11-01', to: '2026-11-30' });

      expect(body.split('\r\n').slice(1, -1)).toEqual([
        expect.stringMatching(/^2026-11-01;00:00;.*;41;/),
      ]);
    });

    it('rejects an invalid period like the statistics', async () => {
      const body = (await get('catches.csv', { from: '2026-10-06', to: '2026-10-05' }).expect(400))
        .body as ErrorBody;

      expect(body.details.fields).toEqual({ to: ['to must not be before from'] });
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('records who exported which period of the organization and how many catches', async () => {
      const { id: permitId } = await permit();
      await fish(permitId);
      await fish(permitId, { caughtAt: new Date('2026-03-01T08:00:00.000Z') });

      await csv({ from: '2026-10-01', to: '2026-10-31' });
      // Without a period: the current season is what the file holds.
      await csv();

      expect(
        await prisma.auditLog.findMany({
          select: { actorId: true, action: true, entity: true, entityId: true, diff: true },
          orderBy: { createdAt: 'asc' },
        }),
      ).toEqual([
        {
          actorId: admin.userId,
          action: 'CATCHES_EXPORTED',
          entity: 'Organization',
          entityId: admin.organizationId,
          diff: { from: '2026-10-01', to: '2026-10-31', rows: 1 },
        },
        {
          actorId: admin.userId,
          action: 'CATCHES_EXPORTED',
          entity: 'Organization',
          entityId: admin.organizationId,
          diff: { from: '2026-01-01', to: '2026-12-31', rows: 2 },
        },
      ]);
    });

    it('does not hand out the file when its audit entry cannot be written', async () => {
      // The entry fails to insert: the export must fail with it, not leave unrecorded.
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" ADD CONSTRAINT no_exports CHECK ("action" <> \'CATCHES_EXPORTED\')',
      );

      const response = await get('catches.csv').expect(500);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('is closed to an inspector of the organization', async () => {
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');

      await get('catches.csv', {}, inspector).expect(403);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('is closed to the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/catches.csv`).set(bearer(token)),
      );
    });
  });
});
