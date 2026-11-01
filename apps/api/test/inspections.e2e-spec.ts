import type { OrgRole } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { generateQrKeyPair } from '../src/modules/permits/qr/qr-keys';
import { QrTokenService } from '../src/modules/permits/qr/qr-token.service';
import { createVerifiedUser, login } from './auth-helpers';
import { FIXED_NOW, createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createOrganization,
  createPermit,
  createPermitType,
  createSpecies,
  createWater,
} from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember } from './org-helpers';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface Verification {
  valid: boolean;
  permit: {
    status: string;
    validFrom: string;
    validTo: string;
    permitType: { name: string };
    organization: { id: string; name: string };
    waters: { id: string; name: string }[];
    holderInitials: string;
  } | null;
  inspection: {
    permitId: string;
    number: string;
    holder: { firstName: string; lastName: string; birthYear: number };
    catchesToday: { id: string; caughtAt: string; status: string }[];
  } | null;
}

interface Inspection {
  id: string;
  permit: {
    id: string;
    number: string;
    permitType: { name: string };
    holder: { firstName: string; lastName: string } | null;
  };
  inspector: { id: string; firstName: string; lastName: string } | null;
  performedAt: string;
  result: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
}

interface ErrorBody {
  code: string;
  details?: { fields?: Record<string, string[]> };
}

/** `hour` (may be fractional) of a day of October 2026 in Warsaw (CEST, UTC+2). */
const warsawOctober = (day: number, hour: number) =>
  new Date(Date.UTC(2026, 9, day) + (hour - 2) * 3_600_000);

// FIXED_NOW is 2026-10-06 17:20 in Warsaw.
describe('inspections', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let organizationId: string;
  let permitTypeId: string;
  let lakeId: string;
  let zalewId: string;
  let speciesId: string;
  let anglerId: string;
  /** ACTIVE today, on the lake. */
  let permit: { id: string; number: string };
  let inspector: { id: string; accessToken: string };
  let admin: { id: string; accessToken: string };

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const qrToken = (id: string, validTo: string) => app.get(QrTokenService).sign(id, validTo);

  const verify = async (token: string, accessToken?: string) => {
    const call = request(server()).get(`/api/v1/verify/${token}`);
    const response = await (accessToken ? call.set(bearer(accessToken)) : call).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body as Verification;
  };

  const paidPermit = (validFrom: string, validTo: string, data: object = {}) =>
    createPermit(prisma, {
      userId: anglerId,
      permitTypeId,
      status: 'PAID',
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      ...data,
    });

  /** A logged-in member of the organization of the permit. */
  const member = async (role: OrgRole) => {
    const user = await createVerifiedUser(prisma, {
      firstName: role === 'INSPECTOR' ? 'Irena' : 'Adam',
      lastName: role === 'INSPECTOR' ? 'Strażnik' : 'Zarządca',
    });
    await prisma.membership.create({ data: { userId: user.id, organizationId, role } });
    return { id: user.id, accessToken: (await login(app, user.email)).accessToken };
  };

  const createInspection = (accessToken: string, body: object, orgId = organizationId) =>
    request(server()).post(`/api/v1/orgs/${orgId}/inspections`).set(bearer(accessToken)).send(body);

  const listInspections = (accessToken: string, query = '', orgId = organizationId) =>
    request(server()).get(`/api/v1/orgs/${orgId}/inspections${query}`).set(bearer(accessToken));

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    organizationId = (await createOrganization(prisma, { status: 'ACTIVE', name: 'Koło PZW 7' }))
      .id;
    const waters = await Promise.all(
      ['Zalew Zegrzyński', 'Jezioro Łańskie'].map((name) =>
        createWater(prisma, { name, status: 'CONNECTED', organizationId }),
      ),
    );
    zalewId = waters[0]!.id;
    lakeId = waters[1]!.id;
    permitTypeId = (
      await createPermitType(prisma, {
        organizationId,
        name: 'Tygodniowe',
        durationDays: 7,
        waters: { connect: waters.map(({ id }) => ({ id })) },
      })
    ).id;
    speciesId = (await createSpecies(prisma)).id;
    anglerId = (
      await createVerifiedUser(prisma, {
        firstName: 'łukasz',
        lastName: 'Żółć',
        birthDate: new Date('1987-03-14'),
      })
    ).id;
    permit = await paidPermit('2026-10-05', '2026-10-11');
    inspector = await member('INSPECTOR');
    admin = await member('ORG_ADMIN');
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('GET /verify/:token', () => {
    const publicPart = {
      status: 'ACTIVE',
      validFrom: '2026-10-05',
      validTo: '2026-10-11',
      permitType: { name: 'Tygodniowe' },
      organization: { name: 'Koło PZW 7' },
      waters: [{ name: 'Jezioro Łańskie' }, { name: 'Zalew Zegrzyński' }],
      holderInitials: 'Ł. Ż.',
    };

    it('shows a guest the validity, type, term, waters and initials only', async () => {
      const body = await verify(await qrToken(permit.id, '2026-10-11'));

      expect(body).toEqual({
        valid: true,
        permit: {
          ...publicPart,
          organization: { id: organizationId, name: 'Koło PZW 7' },
          waters: [
            { id: lakeId, name: 'Jezioro Łańskie' },
            { id: zalewId, name: 'Zalew Zegrzyński' },
          ],
        },
        inspection: null,
      });
    });

    it('shows an inspector of the issuing organization the holder and today’s catches', async () => {
      const otherPermit = await paidPermit('2026-10-01', '2026-10-31');
      const late = await createCatch(prisma, {
        userId: anglerId,
        permitId: permit.id,
        fishingWaterId: lakeId,
        speciesId,
        caughtAt: warsawOctober(6, 16),
      });
      const rejected = await createCatch(prisma, {
        userId: anglerId,
        permitId: permit.id,
        fishingWaterId: lakeId,
        speciesId,
        syncStatus: 'REJECTED',
        violations: [{ code: 'BELOW_MIN_LENGTH', ruleId: 'BR-03' }],
        caughtAt: warsawOctober(6, 0),
      });
      // The day before (23:59 in Warsaw), and a catch of today on another permit.
      await createCatch(prisma, {
        userId: anglerId,
        permitId: permit.id,
        fishingWaterId: lakeId,
        speciesId,
        caughtAt: warsawOctober(5, 23 + 59 / 60),
      });
      await createCatch(prisma, {
        userId: anglerId,
        permitId: otherPermit.id,
        fishingWaterId: lakeId,
        speciesId,
        caughtAt: warsawOctober(6, 12),
      });

      const body = await verify(await qrToken(permit.id, '2026-10-11'), inspector.accessToken);

      expect(body).toMatchObject({ valid: true, permit: publicPart });
      expect(body.inspection).toMatchObject({
        permitId: permit.id,
        number: permit.number,
        holder: { firstName: 'łukasz', lastName: 'Żółć', birthYear: 1987 },
      });
      expect(body.inspection!.catchesToday.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: late.id, status: 'ACCEPTED' },
        { id: rejected.id, status: 'REJECTED' },
      ]);
    });

    it('shows an admin of the issuing organization the full check too', async () => {
      const body = await verify(await qrToken(permit.id, '2026-10-11'), admin.accessToken);

      expect(body.inspection).toMatchObject({ permitId: permit.id, catchesToday: [] });
    });

    it('shows an inspector of another organization only the public part', async () => {
      const stranger = await loginOrgMember(app, prisma, 'INSPECTOR');

      const body = await verify(await qrToken(permit.id, '2026-10-11'), stranger.accessToken);

      expect(body).toMatchObject({ valid: true, permit: publicPart, inspection: null });
    });

    it('shows only the public part while the issuing organization is blocked', async () => {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: 'BLOCKED' },
      });

      const body = await verify(await qrToken(permit.id, '2026-10-11'), inspector.accessToken);

      expect(body).toMatchObject({ permit: publicPart, inspection: null });
    });

    it('marks a revoked permit with a genuine token invalid', async () => {
      const token = await qrToken(permit.id, '2026-10-11');
      await prisma.permit.update({ where: { id: permit.id }, data: { status: 'REVOKED' } });

      const body = await verify(token, inspector.accessToken);

      expect(body).toMatchObject({ valid: false, permit: { status: 'REVOKED' } });
      // The inspector still sees whose permit it is, to write the protocol.
      expect(body.inspection).toMatchObject({ permitId: permit.id });
    });

    it('marks a permit that starts later invalid today', async () => {
      const scheduled = await paidPermit('2026-10-07', '2026-10-13');

      const body = await verify(await qrToken(scheduled.id, '2026-10-13'));

      expect(body).toMatchObject({ valid: false, permit: { status: 'SCHEDULED' } });
    });

    it('rejects a token signed with another key', async () => {
      const { privateKey } = generateQrKeyPair();
      const forged = await new SignJWT()
        .setProtectedHeader({ alg: 'EdDSA' })
        .setSubject(permit.id)
        .setExpirationTime(Math.floor(FIXED_NOW.getTime() / 1000) + 3600)
        .sign(createPrivateKey(privateKey));

      expect(await verify(forged, inspector.accessToken)).toEqual({
        valid: false,
        permit: null,
        inspection: null,
      });
    });

    it('rejects a genuine token whose payload was changed to another permit', async () => {
      const other = await paidPermit('2026-10-01', '2026-10-31');
      const [header, , signature] = (await qrToken(permit.id, '2026-10-11')).split('.');
      const payload = Buffer.from(
        JSON.stringify({ sub: other.id, exp: Math.floor(FIXED_NOW.getTime() / 1000) + 3600 }),
      ).toString('base64url');

      expect(await verify(`${header}.${payload}.${signature}`)).toMatchObject({
        valid: false,
        permit: null,
      });
    });

    it('rejects a malformed token and a token of an unknown permit', async () => {
      expect(await verify('not-a-token')).toMatchObject({ valid: false, permit: null });
      expect(await verify(await qrToken(UNKNOWN_ID, '2026-10-11'))).toMatchObject({
        valid: false,
        permit: null,
      });
    });

    it('rejects the token of a permit whose last day has passed', async () => {
      const expired = await paidPermit('2026-09-28', '2026-10-05');

      expect(await verify(await qrToken(expired.id, '2026-10-05'))).toMatchObject({
        valid: false,
        permit: null,
      });
    });

    it('shows nothing of a permit of an anonymised holder', async () => {
      const token = await qrToken(permit.id, '2026-10-11');
      await prisma.user.update({ where: { id: anglerId }, data: { deletedAt: FIXED_NOW } });

      expect(await verify(token, inspector.accessToken)).toMatchObject({
        valid: false,
        permit: null,
        inspection: null,
      });
    });

    it('answers 401 to an invalid access token instead of treating it as a guest', async () => {
      const response = await request(server())
        .get(`/api/v1/verify/${await qrToken(permit.id, '2026-10-11')}`)
        .set(bearer('a.b.c'))
        .expect(401);

      expect((response.body as ErrorBody).code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /orgs/:orgId/inspections', () => {
    it('saves the protocol of an inspector with the time of the server', async () => {
      const response = await createInspection(inspector.accessToken, {
        permitId: permit.id.toUpperCase(),
        result: 'VIOLATION',
        notes: '  Szczupak 40 cm zabrany  ',
        lat: 52.43,
        lng: 21.03,
      }).expect(201);

      const body = response.body as Inspection;
      expect(body).toEqual({
        id: expect.any(String) as string,
        permit: {
          id: permit.id,
          number: permit.number,
          permitType: { name: 'Tygodniowe' },
          holder: { firstName: 'łukasz', lastName: 'Żółć' },
        },
        inspector: { id: inspector.id, firstName: 'Irena', lastName: 'Strażnik' },
        performedAt: FIXED_NOW.toISOString(),
        result: 'VIOLATION',
        notes: 'Szczupak 40 cm zabrany',
        lat: 52.43,
        lng: 21.03,
      });
      expect(await prisma.inspection.findUniqueOrThrow({ where: { id: body.id } })).toMatchObject({
        organizationId,
        inspectorId: inspector.id,
        permitId: permit.id,
      });
    });

    it('lets an admin save a protocol, without notes or a position', async () => {
      const response = await createInspection(admin.accessToken, {
        permitId: permit.id,
        result: 'OK',
        notes: '   ',
      }).expect(201);

      expect(response.body).toMatchObject({ result: 'OK', notes: null, lat: null, lng: null });
    });

    it('saves a protocol of a revoked permit', async () => {
      await prisma.permit.update({ where: { id: permit.id }, data: { status: 'REVOKED' } });

      await createInspection(inspector.accessToken, {
        permitId: permit.id,
        result: 'VIOLATION',
      }).expect(201);
    });

    it('treats a permit of another organization as unknown', async () => {
      const foreign = await createPermit(prisma, { status: 'PAID' });

      for (const permitId of [foreign.id, UNKNOWN_ID]) {
        const response = await createInspection(inspector.accessToken, {
          permitId,
          result: 'OK',
        }).expect(404);
        expect((response.body as ErrorBody).code).toBe('NOT_FOUND');
      }
      expect(await prisma.inspection.count()).toBe(0);
    });

    it('rejects an invalid protocol', async () => {
      const notes = 'a'.repeat(2001);
      for (const body of [
        { permitId: permit.id },
        { permitId: permit.id, result: 'MAYBE' },
        { permitId: 'nope', result: 'OK' },
        { permitId: permit.id, result: 'OK', notes },
        { permitId: permit.id, result: 'OK', lat: 52 },
        { permitId: permit.id, result: 'OK', lng: 200, lat: 52 },
        { permitId: permit.id, result: 'OK', inspectorId: admin.id },
      ]) {
        const response = await createInspection(inspector.accessToken, body).expect(400);
        expect((response.body as ErrorBody).code).toBe('VALIDATION_FAILED');
      }
    });

    it('rejects a guest and a member of a blocked organization', async () => {
      await request(server())
        .post(`/api/v1/orgs/${organizationId}/inspections`)
        .send({ permitId: permit.id, result: 'OK' })
        .expect(401);

      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: 'BLOCKED' },
      });
      const response = await createInspection(inspector.accessToken, {
        permitId: permit.id,
        result: 'OK',
      }).expect(403);
      expect((response.body as ErrorBody).code).toBe('ORG_NOT_ACTIVE');
    });

    it('rejects the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, accessToken) =>
        createInspection(accessToken, { permitId: permit.id, result: 'OK' }, orgId),
      );
    });
  });

  describe('GET /orgs/:orgId/inspections', () => {
    const protocol = (performedAt: Date, data: object = {}) =>
      prisma.inspection.create({
        data: {
          inspectorId: inspector.id,
          permitId: permit.id,
          organizationId,
          performedAt,
          result: 'OK',
          ...data,
        },
      });

    it('lists the protocols of the season, latest first, only of the organization', async () => {
      // 1 January 2026 00:30 in Warsaw (CET): the first protocol of the season.
      const first = await protocol(new Date('2025-12-31T23:30:00.000Z'));
      const latest = await protocol(warsawOctober(6, 10), { result: 'VIOLATION', notes: 'Brak' });
      await protocol(new Date('2025-12-31T22:30:00.000Z'));
      const stranger = await loginOrgMember(app, prisma, 'INSPECTOR');
      const foreignPermit = await createPermit(prisma, { status: 'PAID' });
      await prisma.inspection.create({
        data: {
          inspectorId: stranger.userId,
          permitId: foreignPermit.id,
          organizationId: stranger.organizationId,
          performedAt: warsawOctober(6, 11),
          result: 'OK',
        },
      });

      const response = await listInspections(admin.accessToken).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.body as Inspection[];
      expect(body.map(({ id }) => id)).toEqual([latest.id, first.id]);
      expect(body[0]).toMatchObject({
        permit: { number: permit.number, holder: { lastName: 'Żółć' } },
        inspector: { id: inspector.id, lastName: 'Strażnik' },
        result: 'VIOLATION',
        notes: 'Brak',
      });
    });

    it('lists another season on request', async () => {
      const previous = await protocol(new Date('2025-12-31T22:30:00.000Z'));
      await protocol(warsawOctober(6, 10));

      const response = await listInspections(admin.accessToken, '?season=2025').expect(200);

      expect((response.body as Inspection[]).map(({ id }) => id)).toEqual([previous.id]);
      await listInspections(admin.accessToken, '?season=1999').expect(400);
    });

    it('shows an anonymised inspector and holder as unknown', async () => {
      await protocol(warsawOctober(6, 10));
      await prisma.user.updateMany({
        where: { id: { in: [inspector.id, anglerId] } },
        data: { deletedAt: FIXED_NOW },
      });

      const response = await listInspections(admin.accessToken).expect(200);

      expect(response.body).toMatchObject([{ inspector: null, permit: { holder: null } }]);
    });

    it('is for admins only', async () => {
      const response = await listInspections(inspector.accessToken).expect(403);

      expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
    });

    it('rejects the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, accessToken) =>
        listInspections(accessToken, '', orgId),
      );
    });
  });
});
