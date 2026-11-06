import { REVOKE_REASON_MAX_LENGTH } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createPermit, createPermitType, createUser } from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

interface OrgPermit {
  id: string;
  number: string;
  status: string;
  validFrom: string;
  validTo: string;
  pricePaidGrosze: number;
  permitType: { id: string; name: string };
  holder: { firstName: string; lastName: string } | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

interface PermitPage {
  items: OrgPermit[];
  total: number;
  page: number;
  pageSize: number;
}

// FIXED_NOW is 2026-10-06 17:20 in Warsaw.
describe('permits sold by an organization (FR-10)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let now: Date;
  let admin: OrgMember;
  let typeId: string;
  let anglerId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = async (query: Record<string, string> = {}, member = admin) =>
    (
      await request(server())
        .get(`/api/v1/orgs/${member.organizationId}/permits`)
        .query(query)
        .set(bearer(member.accessToken))
        .expect(200)
    ).body as PermitPage;
  const revoke = (
    id: string,
    body: Record<string, unknown> = { reason: 'Zwrot' },
    member = admin,
  ) =>
    request(server())
      .post(`/api/v1/orgs/${member.organizationId}/permits/${id}/revoke`)
      .set(bearer(member.accessToken))
      .send(body);
  /** A paid permit of the organization's type; `createdAt` orders the list. */
  const sold = (validFrom: string, validTo: string, data: Record<string, unknown> = {}) =>
    createPermit(prisma, {
      permitTypeId: typeId,
      userId: anglerId,
      status: 'PAID',
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      ...data,
    });

  const untilSomeQueryWaitsForLock = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS "waiting" FROM pg_stat_activity
        WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
      if (row && row.waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('No query waited for the lock');
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = FIXED_NOW;
    app = await createTestApp({ prisma, now: () => now });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    ({ id: typeId } = await createPermitType(prisma, {
      organizationId: admin.organizationId,
      name: 'Roczne',
    }));
    ({ id: anglerId } = await createUser(prisma, { firstName: 'Jan', lastName: 'Kowalski' }));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('GET /orgs/:orgId/permits', () => {
    it('lists paid and revoked permits of the organization with the computed status', async () => {
      const active = await sold('2026-10-01', '2026-10-31', {
        number: 'ZW-2026-000001',
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
      });
      const scheduled = await sold('2026-11-01', '2026-11-01', {
        createdAt: new Date('2026-10-02T08:00:00.000Z'),
      });
      const expired = await sold('2026-09-01', '2026-09-30', {
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
      });
      const revoked = await sold('2026-10-01', '2026-10-31', {
        status: 'REVOKED',
        revokedAt: new Date('2026-10-03T08:00:00.000Z'),
        revokeReason: 'Zwrot',
        createdAt: new Date('2026-10-03T07:00:00.000Z'),
      });
      // Not sales: a payment in progress, a cancelled one; nor a permit of another organization.
      await sold('2026-10-06', '2026-10-06', { status: 'PENDING_PAYMENT' });
      await sold('2026-10-06', '2026-10-06', { status: 'CANCELLED' });
      await createPermit(prisma, { status: 'PAID' });

      const page = await list();

      expect(page).toMatchObject({ total: 4, page: 1, pageSize: 20 });
      expect(page.items.map((permit) => [permit.id, permit.status])).toEqual([
        [revoked.id, 'REVOKED'],
        [scheduled.id, 'SCHEDULED'],
        [active.id, 'ACTIVE'],
        [expired.id, 'EXPIRED'],
      ]);
      expect(page.items[2]).toEqual({
        id: active.id,
        number: 'ZW-2026-000001',
        status: 'ACTIVE',
        validFrom: '2026-10-01',
        validTo: '2026-10-31',
        pricePaidGrosze: 2500,
        permitType: { id: typeId, name: 'Roczne' },
        holder: { firstName: 'Jan', lastName: 'Kowalski' },
        createdAt: '2026-10-01T08:00:00.000Z',
        revokedAt: null,
        revokeReason: null,
      });
      expect(page.items[0]).toMatchObject({
        revokedAt: '2026-10-03T08:00:00.000Z',
        revokeReason: 'Zwrot',
      });
    });

    it.each([
      ['ACTIVE', ['2026-10-06 last day']],
      ['SCHEDULED', ['2026-10-07 first day']],
      ['EXPIRED', ['2026-10-05 last day']],
      ['REVOKED', ['revoked']],
    ])('filters %s by the Warsaw day', async (status, expected) => {
      await sold('2026-09-01', '2026-10-06', { number: '2026-10-06 last day' });
      await sold('2026-10-07', '2026-10-07', { number: '2026-10-07 first day' });
      await sold('2026-09-01', '2026-10-05', { number: '2026-10-05 last day' });
      await sold('2026-10-01', '2026-10-31', { number: 'revoked', status: 'REVOKED' });

      const page = await list({ status });

      expect(page.items.map((permit) => permit.number)).toEqual(expected);
      expect(page.total).toBe(expected.length);
    });

    it.each([
      // 00:30 in Warsaw is still the day before in UTC.
      ['an ordinary night', '2026-10-06', '2026-10-07', '2026-10-06T22:30:00.000Z'],
      // The same across the New Year (UTC+1).
      ['New Year', '2026-12-31', '2027-01-01', '2026-12-31T23:30:00.000Z'],
      // The night of the change to winter time: 00:30 is still summer time (UTC+2).
      ['the change to winter time', '2026-10-24', '2026-10-25', '2026-10-24T22:30:00.000Z'],
    ])(
      'moves a permit to the next status at Warsaw midnight, not UTC midnight (%s)',
      async (_case, yesterday, today, instant) => {
        await sold(yesterday, yesterday, { number: 'yesterday' });
        await sold(today, today, { number: 'today' });
        await sold(today, today, { number: 'revoked', status: 'REVOKED' });
        now = new Date(instant);
        admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
        await prisma.permitType.update({
          where: { id: typeId },
          data: { organizationId: admin.organizationId },
        });

        const page = await list();

        expect(
          Object.fromEntries(page.items.map((permit) => [permit.number, permit.status])),
        ).toEqual({ yesterday: 'EXPIRED', today: 'ACTIVE', revoked: 'REVOKED' });
        expect((await list({ status: 'ACTIVE' })).items.map((permit) => permit.number)).toEqual([
          'today',
        ]);
        expect((await list({ status: 'EXPIRED' })).items.map((permit) => permit.number)).toEqual([
          'yesterday',
        ]);
      },
    );

    it('finds a permit by a part of its number, case-insensitively, % and _ as such', async () => {
      await sold('2026-10-01', '2026-10-31', { number: 'ZW-2026-000123' });
      await sold('2026-10-01', '2026-10-31', { number: 'ZW-2026-000124' });

      expect((await list({ q: 'zw-2026-000123' })).items.map((p) => p.number)).toEqual([
        'ZW-2026-000123',
      ]);
      expect((await list({ q: '0001%' })).total).toBe(0);
      expect((await list({ q: '00012_' })).total).toBe(0);
    });

    it('pages the list', async () => {
      for (let day = 1; day <= 5; day += 1) {
        await sold('2026-10-01', '2026-10-31', {
          number: `N-${day}`,
          createdAt: new Date(`2026-10-0${day}T08:00:00.000Z`),
        });
      }

      const second = await list({ page: '2', pageSize: '2' });

      expect(second).toMatchObject({ total: 5, page: 2, pageSize: 2 });
      expect(second.items.map((permit) => permit.number)).toEqual(['N-3', 'N-2']);
      expect((await list({ page: '4', pageSize: '2' })).items).toEqual([]);
    });

    it('shows no holder of an anonymised account', async () => {
      await prisma.user.update({ where: { id: anglerId }, data: { deletedAt: FIXED_NOW } });
      await sold('2026-10-01', '2026-10-31');

      expect((await list()).items[0]?.holder).toBeNull();
    });

    it.each([
      [{ status: 'PAID' }],
      [{ status: 'PENDING_PAYMENT' }],
      [{ page: '0' }],
      [{ pageSize: '101' }],
      [{ pageSize: 'ten' }],
      [{ q: '' }],
      [{ q: 'x'.repeat(21) }],
      [{ unknown: '1' }],
    ])('refuses the query %j', async (query) => {
      const response = await request(server())
        .get(`/api/v1/orgs/${admin.organizationId}/permits`)
        .query(query)
        .set(bearer(admin.accessToken))
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('POST /orgs/:orgId/permits/:id/revoke', () => {
    it('revokes an active permit with the reason and logs it', async () => {
      const permit = await sold('2026-10-01', '2026-10-31', { number: 'ZW-2026-000007' });

      const response = await revoke(permit.id, { reason: '  Zwrot przelewem 6.10  ' }).expect(200);

      expect(response.body).toMatchObject({
        id: permit.id,
        status: 'REVOKED',
        revokedAt: FIXED_NOW.toISOString(),
        revokeReason: 'Zwrot przelewem 6.10',
      });
      expect(await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } })).toMatchObject({
        status: 'REVOKED',
        revokedAt: FIXED_NOW,
      });
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          action: 'PERMIT_REVOKED',
          entity: 'Permit',
          entityId: permit.id,
          diff: {
            organizationId: admin.organizationId,
            number: 'ZW-2026-000007',
            from: 'ACTIVE',
            reason: 'Zwrot przelewem 6.10',
          },
        }),
      ]);
    });

    it('revokes a scheduled permit, and the angler sees it revoked without a QR code', async () => {
      const angler = await createVerifiedUser(prisma);
      const permit = await sold('2026-11-01', '2026-11-30', { userId: angler.id });

      await revoke(permit.id).expect(200);

      const { accessToken } = await login(app, angler.email);
      const mine = await request(server())
        .get(`/api/v1/me/permits/${permit.id}`)
        .set(bearer(accessToken))
        .expect(200);
      expect(mine.body).toMatchObject({ status: 'REVOKED', qrToken: null });
    });

    it.each([
      ['expired', { validTo: new Date('2026-10-05') }, 'EXPIRED'],
      ['revoked', { status: 'REVOKED' }, 'REVOKED'],
      ['unpaid', { status: 'PENDING_PAYMENT' }, 'PENDING_PAYMENT'],
      ['cancelled', { status: 'CANCELLED' }, 'CANCELLED'],
    ])('refuses to revoke a %s permit', async (_case, data, status) => {
      const permit = await sold('2026-10-01', '2026-10-31', data);

      const response = await revoke(permit.id).expect(422);

      expect(response.body).toMatchObject({ code: 'PERMIT_NOT_REVOCABLE', details: { status } });
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('lets one of two revocations at once through', async () => {
      const permit = await sold('2026-10-01', '2026-10-31');
      // The first revocation holds the permit and commits only once the second waits for it.
      let locked!: () => void;
      let commit!: () => void;
      const lockedPromise = new Promise<void>((resolve) => (locked = resolve));
      const commitPromise = new Promise<void>((resolve) => (commit = resolve));
      const first = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Permit" WHERE "id" = ${permit.id}::uuid FOR NO KEY UPDATE`;
          await tx.permit.update({
            where: { id: permit.id },
            data: { status: 'REVOKED', revokedAt: FIXED_NOW, revokeReason: 'Pierwsze' },
          });
          locked();
          await commitPromise;
        },
        { timeout: 20_000 },
      );
      await lockedPromise;
      const second = revoke(permit.id).then((result) => result);
      await untilSomeQueryWaitsForLock();
      commit();
      await first;

      const response = await second;
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'PERMIT_NOT_REVOCABLE',
        details: { status: 'REVOKED' },
      });
      expect(await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } })).toMatchObject({
        revokeReason: 'Pierwsze',
      });
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('requires a reason within the limit', async () => {
      const permit = await sold('2026-10-01', '2026-10-31');

      await revoke(permit.id, {}).expect(400);
      await revoke(permit.id, { reason: '   ' }).expect(400);
      await revoke(permit.id, { reason: 'a'.repeat(REVOKE_REASON_MAX_LENGTH + 1) }).expect(400);
      await revoke(permit.id, { reason: 'a'.repeat(REVOKE_REASON_MAX_LENGTH) }).expect(200);
    });

    it('treats a permit of another organization as unknown', async () => {
      const foreign = await createPermit(prisma, {
        status: 'PAID',
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2026-10-31'),
      });

      const response = await revoke(foreign.id).expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.permit.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({
        status: 'PAID',
      });
      await revoke('00000000-0000-4000-8000-000000000000').expect(404);
      await revoke('not-a-uuid').expect(400);
    });
  });

  describe('access', () => {
    it('is for the admins of the organization', async () => {
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');
      await request(server())
        .get(`/api/v1/orgs/${inspector.organizationId}/permits`)
        .set(bearer(inspector.accessToken))
        .expect(403);
      await request(server()).get(`/api/v1/orgs/${admin.organizationId}/permits`).expect(401);
    });

    it('closes both routes to an admin of another organization', async () => {
      const permit = await sold('2026-10-01', '2026-10-31');

      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/permits`).set(bearer(token)),
      );
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .post(`/api/v1/orgs/${orgId}/permits/${permit.id}/revoke`)
          .set(bearer(token))
          .send({ reason: 'x' }),
      );
      expect(await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } })).toMatchObject({
        status: 'PAID',
      });
    });
  });
});
