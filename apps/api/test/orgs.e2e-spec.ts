import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization } from './factories';

// `expect.any()` is typed as `any`; narrowing it keeps the assertions type-checked.
const anyString: unknown = expect.any(String);

const application = {
  name: ' Koło PZW nr 12 Warszawa ',
  nip: '526-025-02-74',
  kind: 'PZW',
  contactEmail: 'kolo12@example.test',
};

describe('organizations', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let userId: string;
  let accessToken: string;
  let superAdminToken: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const apply = (body: object, token = accessToken) =>
    http().post('/api/v1/orgs').set(auth(token)).send(body);

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    const user = await createVerifiedUser(prisma);
    userId = user.id;
    ({ accessToken } = await login(app, user.email));
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    ({ accessToken: superAdminToken } = await login(app, superAdmin.email));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /orgs', () => {
    it('creates a PENDING organization and makes the applicant its ORG_ADMIN', async () => {
      const response = await apply(application).expect(201);

      expect(response.body).toEqual({
        id: anyString,
        name: 'Koło PZW nr 12 Warszawa',
        nip: '5260250274',
        kind: 'PZW',
        status: 'PENDING',
        contactEmail: 'kolo12@example.test',
        createdAt: anyString,
      });
      const memberships = await prisma.membership.findMany({
        where: { organizationId: (response.body as { id: string }).id },
      });
      expect(memberships).toEqual([expect.objectContaining({ userId, role: 'ORG_ADMIN' })]);
    });

    it('rejects a NIP with a wrong checksum', async () => {
      const response = await apply({ ...application, nip: '5260250275' }).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { nip: ['nip must be 10 digits with a valid checksum'] } },
      });
    });

    it.each([
      ['an unknown kind', { kind: 'CLUB' }],
      ['an invalid contact email', { contactEmail: 'kolo' }],
      ['a blank name', { name: '   ' }],
      ['a status chosen by the applicant', { status: 'ACTIVE' }],
    ])('rejects %s', async (_case, change) => {
      await apply({ ...application, ...change })
        .expect(400)
        .expect(({ body }) => expect(body).toMatchObject({ code: 'VALIDATION_FAILED' }));
      expect(await prisma.organization.count()).toBe(0);
    });

    it('answers NIP_TAKEN for a NIP already registered, whatever the separators', async () => {
      await createOrganization(prisma, { nip: '5260250274', status: 'BLOCKED' });

      await apply({ ...application, nip: '526 025 02 74' })
        .expect(409)
        .expect(({ body }) => expect(body).toMatchObject({ code: 'NIP_TAKEN' }));
      expect(await prisma.membership.count()).toBe(0);
    });

    it('lets only one of two simultaneous applications with one NIP through', async () => {
      const results = await Promise.all([apply(application), apply(application)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.organization.count()).toBe(1);
      expect(await prisma.membership.count()).toBe(1);
    });

    it('turns the unique index violation into NIP_TAKEN when the pre-check misses it', async () => {
      await createOrganization(prisma, { nip: '5260250274' });
      // Simulates the other application committing between the check and the insert.
      jest.spyOn(prisma.organization, 'count').mockResolvedValueOnce(0);

      await apply(application)
        .expect(409)
        .expect(({ body }) => expect(body).toMatchObject({ code: 'NIP_TAKEN' }));
      expect(await prisma.membership.count()).toBe(0);
    });

    it('requires a logged-in user', async () => {
      await http().post('/api/v1/orgs').send(application).expect(401);
    });
  });

  describe('GET /me/orgs', () => {
    it('lists only the organizations of the token owner, with all roles in each', async () => {
      const zeta = await createOrganization(prisma, { name: 'Zeta', status: 'ACTIVE' });
      const alfa = await createOrganization(prisma, { name: 'Alfa', status: 'BLOCKED' });
      const foreign = await createOrganization(prisma);
      const other = await createVerifiedUser(prisma);
      await prisma.membership.createMany({
        data: [
          { userId, organizationId: zeta.id, role: 'INSPECTOR' },
          { userId, organizationId: zeta.id, role: 'ORG_ADMIN' },
          { userId, organizationId: alfa.id, role: 'INSPECTOR' },
          { userId: other.id, organizationId: foreign.id, role: 'ORG_ADMIN' },
        ],
      });

      const response = await http().get('/api/v1/me/orgs').set(auth(accessToken)).expect(200);

      expect(response.body).toEqual([
        { id: alfa.id, name: 'Alfa', kind: 'PZW', status: 'BLOCKED', roles: ['INSPECTOR'] },
        {
          id: zeta.id,
          name: 'Zeta',
          kind: 'PZW',
          status: 'ACTIVE',
          roles: ['ORG_ADMIN', 'INSPECTOR'],
        },
      ]);
    });

    it('returns an empty list for an angler without organizations', async () => {
      await http()
        .get('/api/v1/me/orgs')
        .set(auth(accessToken))
        .expect(200)
        .expect(({ body }) => expect(body).toEqual([]));
    });
  });

  describe('/admin/orgs', () => {
    it('lists organizations oldest first and filters by status', async () => {
      const older = await createOrganization(prisma, {
        createdAt: new Date(FIXED_NOW.getTime() - 60_000),
      });
      const newer = await createOrganization(prisma, { createdAt: FIXED_NOW });
      const active = await createOrganization(prisma, {
        status: 'ACTIVE',
        createdAt: new Date(FIXED_NOW.getTime() + 60_000),
      });

      const all = await http().get('/api/v1/admin/orgs').set(auth(superAdminToken)).expect(200);
      const pending = await http()
        .get('/api/v1/admin/orgs?status=PENDING')
        .set(auth(superAdminToken))
        .expect(200);

      expect((all.body as { id: string }[]).map((o) => o.id)).toEqual([
        older.id,
        newer.id,
        active.id,
      ]);
      expect((pending.body as { id: string }[]).map((o) => o.id)).toEqual([older.id, newer.id]);
      expect(pending.body).not.toContainEqual(expect.objectContaining({ id: active.id }));
    });

    it('activates and then blocks an organization', async () => {
      const organization = await createOrganization(prisma);
      const setStatus = (status: string) =>
        http()
          .patch(`/api/v1/admin/orgs/${organization.id}/status`)
          .set(auth(superAdminToken))
          .send({ status });

      await setStatus('ACTIVE')
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({ id: organization.id, status: 'ACTIVE' }),
        );
      await setStatus('BLOCKED').expect(200);
      // Repeating the current status is harmless.
      await setStatus('BLOCKED').expect(200);

      expect(
        await prisma.organization.findUnique({ where: { id: organization.id } }),
      ).toMatchObject({ status: 'BLOCKED' });
    });

    it('does not accept PENDING as a new status', async () => {
      const organization = await createOrganization(prisma, { status: 'ACTIVE' });

      await http()
        .patch(`/api/v1/admin/orgs/${organization.id}/status`)
        .set(auth(superAdminToken))
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('answers NOT_FOUND for an unknown organization and 400 for a non-UUID id', async () => {
      await http()
        .patch('/api/v1/admin/orgs/6f1c1d2e-8b8a-4c55-9a52-3f0e1d6b7a90/status')
        .set(auth(superAdminToken))
        .send({ status: 'ACTIVE' })
        .expect(404)
        .expect(({ body }) => expect(body).toMatchObject({ code: 'NOT_FOUND' }));
      await http()
        .patch('/api/v1/admin/orgs/nope/status')
        .set(auth(superAdminToken))
        .send({ status: 'ACTIVE' })
        .expect(400);
    });

    it('is closed to users without the super admin flag, organization admins included', async () => {
      const organization = await createOrganization(prisma);
      await prisma.membership.create({
        data: { userId, organizationId: organization.id, role: 'ORG_ADMIN' },
      });

      await http().get('/api/v1/admin/orgs').set(auth(accessToken)).expect(403);
      await http()
        .patch(`/api/v1/admin/orgs/${organization.id}/status`)
        .set(auth(accessToken))
        .send({ status: 'ACTIVE' })
        .expect(403)
        .expect(({ body }) => expect(body).toMatchObject({ code: 'FORBIDDEN' }));
      expect(
        await prisma.organization.findUnique({ where: { id: organization.id } }),
      ).toMatchObject({ status: 'PENDING' });
    });
  });
});
