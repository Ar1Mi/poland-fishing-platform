import { Controller, Get, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { Roles, SuperAdmin } from '../src/modules/organizations/decorators/org-access.decorators';
import { OrgScopeGuard } from '../src/modules/organizations/guards/org-scope.guard';
import { OrganizationsModule } from '../src/modules/organizations/organizations.module';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization } from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember } from './org-helpers';

// Test-only routes guarded the way real /orgs/:orgId/* and /admin/* routes will be.
// The staff route has @Roles only: it must bring the scope/status check by itself.
@Controller()
class ProbeController {
  @Get('orgs/:orgId/probe/admin')
  @UseGuards(OrgScopeGuard)
  @Roles('ORG_ADMIN')
  adminOnly(): string {
    return 'ok';
  }

  @Get('orgs/:orgId/probe/staff')
  @Roles('ORG_ADMIN', 'INSPECTOR')
  staff(): string {
    return 'ok';
  }

  @Get('probe/super-admin')
  @SuperAdmin()
  superAdmin(): string {
    return 'ok';
  }
}

describe('RolesGuard and OrgScopeGuard', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;

  const get = (path: string, accessToken?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/${path}`);
    return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({
      prisma,
      controllers: [ProbeController],
      imports: [OrganizationsModule],
    });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('lets the ORG_ADMIN of an active organization in', async () => {
    const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');

    await get(`orgs/${admin.organizationId}/probe/admin`, admin.accessToken).expect(200);
  });

  it('rejects the admin of another organization with ORG_SCOPE_VIOLATION', async () => {
    await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
      get(`orgs/${orgId}/probe/admin`, token),
    );
  });

  it('lets an INSPECTOR into staff routes but not into ORG_ADMIN routes', async () => {
    const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');

    await get(`orgs/${inspector.organizationId}/probe/staff`, inspector.accessToken).expect(200);
    const response = await get(
      `orgs/${inspector.organizationId}/probe/admin`,
      inspector.accessToken,
    ).expect(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      details: { requiredRoles: ['ORG_ADMIN'] },
    });
  });

  it('counts a role held alongside another one in the same organization', async () => {
    const member = await loginOrgMember(app, prisma, 'INSPECTOR');
    await prisma.membership.create({
      data: { userId: member.userId, organizationId: member.organizationId, role: 'ORG_ADMIN' },
    });

    await get(`orgs/${member.organizationId}/probe/admin`, member.accessToken).expect(200);
  });

  it.each([
    ['PENDING', 'admin'],
    ['BLOCKED', 'admin'],
    ['BLOCKED', 'staff'],
  ] as const)(
    'rejects members of a %s organization with ORG_NOT_ACTIVE (%s route)',
    async (status, route) => {
      const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN', status);

      const response = await get(
        `orgs/${admin.organizationId}/probe/${route}`,
        admin.accessToken,
      ).expect(403);
      expect(response.body).toMatchObject({ code: 'ORG_NOT_ACTIVE', details: { status } });
    },
  );

  it('reports an inactive organization before a missing role', async () => {
    const inspector = await loginOrgMember(app, prisma, 'INSPECTOR', 'BLOCKED');

    const response = await get(
      `orgs/${inspector.organizationId}/probe/admin`,
      inspector.accessToken,
    ).expect(403);
    expect(response.body).toMatchObject({ code: 'ORG_NOT_ACTIVE' });
  });

  it.each([
    ['an unknown organization id', '6f1c1d2e-8b8a-4c55-9a52-3f0e1d6b7a90'],
    ['an id that is not a UUID', 'not-a-uuid'],
  ])('answers %s like a foreign organization', async (_case, orgId) => {
    const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');

    const response = await get(`orgs/${orgId}/probe/admin`, admin.accessToken).expect(403);
    expect(response.body).toMatchObject({ code: 'ORG_SCOPE_VIOLATION' });
  });

  it('gives a super admin no access to an organization they do not belong to', async () => {
    const organization = await createOrganization(prisma, { status: 'ACTIVE' });
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    const { accessToken } = await login(app, superAdmin.email);

    const response = await get(`orgs/${organization.id}/probe/staff`, accessToken).expect(403);
    expect(response.body).toMatchObject({ code: 'ORG_SCOPE_VIOLATION' });
  });

  it('requires a token before any organization check', async () => {
    const organization = await createOrganization(prisma, { status: 'ACTIVE' });

    await get(`orgs/${organization.id}/probe/admin`)
      .expect(401)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'UNAUTHENTICATED' }));
  });

  it('opens @SuperAdmin() routes to super admins only', async () => {
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    const angler = await createVerifiedUser(prisma);
    const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');

    await get('probe/super-admin', (await login(app, superAdmin.email)).accessToken).expect(200);
    for (const accessToken of [(await login(app, angler.email)).accessToken, admin.accessToken]) {
      const response = await get('probe/super-admin', accessToken).expect(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('takes a revoked super admin flag into account without a new token', async () => {
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    const { accessToken } = await login(app, superAdmin.email);
    await prisma.user.update({ where: { id: superAdmin.id }, data: { isSuperAdmin: false } });

    await get('probe/super-admin', accessToken).expect(403);
  });
});
