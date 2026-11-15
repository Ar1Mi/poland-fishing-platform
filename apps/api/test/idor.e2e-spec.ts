import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { OpenAPIObject } from '@nestjs/swagger';
import request, { type Test } from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createOrganization,
  createPermit,
  createPermitType,
  createSpecies,
  createWater,
} from './factories';
import { PNG } from './images';
import { loginOrgMember, type OrgMember } from './org-helpers';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof METHODS)[number];

interface Route {
  method: Method;
  /** OpenAPI form without the global prefix, e.g. `orgs/{orgId}/rules/{id}`. */
  path: string;
}

/**
 * Every route of the API from its OpenAPI document — the same list Swagger and the web client
 * are built from, so a new route is checked here without editing this file.
 */
function routesOf(document: OpenAPIObject): Route[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => item[method]).map((method) => ({
      method,
      path: path.replace(/^\/api\/v1\//, ''),
    })),
  );
}

const label = ({ method, path }: Route) => `${method.toUpperCase()} ${path}`;

/**
 * NFR-04, T-28 (docs/07-security.md → «Доступ к чужой организации (IDOR)»).
 * 1. Route level: every `/orgs/:orgId/*` route rejects people outside the organization before
 *    it reads the body or a file; every `/admin/*` route rejects whoever is not a super admin.
 * 2. Object level: the admin of organization A, on A's own path, cannot reach an object of
 *    organization B by its id (route parameter or a reference in the body) — 404, nothing changes.
 */
describe('IDOR across organizations (T-28)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let routes: Route[];

  const send = (route: Route, path: string, accessToken: string): Test =>
    request(app.getHttpServer())
      [route.method](`/api/v1/${path}`)
      .set('Authorization', `Bearer ${accessToken}`);

  /** The path with `orgId` and every other parameter filled in. */
  const fill = (path: string, orgId: string, params: Record<string, string> = {}) =>
    path.replace(/\{(\w+)\}/g, (_, name: string) =>
      name === 'orgId' ? orgId : (params[name] ?? randomUUID()),
    );

  beforeAll(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    // Served by setupApp; importing app.setup here would load the logger before the filter.
    routes = routesOf(
      (await request(app.getHttpServer()).get('/api/docs-json').expect(200)).body as OpenAPIObject,
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('route level', () => {
    const orgRoutes = () => routes.filter(({ path }) => path.startsWith('orgs/{orgId}/'));
    const adminRoutes = () => routes.filter(({ path }) => path.startsWith('admin/'));

    it('finds the organization and admin routes in the API document', () => {
      // A wrong prefix or an empty document would make the checks below pass on nothing.
      expect(orgRoutes().length).toBeGreaterThanOrEqual(25);
      expect(adminRoutes().length).toBeGreaterThanOrEqual(10);
      expect(orgRoutes().map(label)).toEqual(
        expect.arrayContaining([
          'GET orgs/{orgId}/catches.csv',
          'POST orgs/{orgId}/permits/{id}/revoke',
          'PUT orgs/{orgId}/waters/{id}/photo',
          'DELETE orgs/{orgId}/members/{userId}',
        ]),
      );
    });

    it('rejects the admin and the inspector of another organization on every /orgs/:orgId route', async () => {
      const victim = await createOrganization(prisma, { status: 'ACTIVE' });
      const outsiders = [
        await loginOrgMember(app, prisma, 'ORG_ADMIN'),
        await loginOrgMember(app, prisma, 'INSPECTOR'),
      ];
      const leaks: string[] = [];

      for (const route of orgRoutes()) {
        for (const outsider of outsiders) {
          const response = await send(
            route,
            fill(route.path, victim.id),
            outsider.accessToken,
          ).send({});
          const { code } = response.body as { code?: string };
          if (response.status !== 403 || code !== 'ORG_SCOPE_VIOLATION') {
            leaks.push(`${label(route)}: ${response.status} ${code}`);
          }
        }
      }

      expect(leaks).toEqual([]);
    });

    it('rejects an account without memberships, a super admin included, on every /orgs/:orgId route', async () => {
      const victim = await createOrganization(prisma, { status: 'ACTIVE' });
      const tokens = [
        (await login(app, (await createVerifiedUser(prisma)).email)).accessToken,
        // Super admins get no bypass (docs/01-requirements.md → roles).
        (await login(app, (await createVerifiedUser(prisma, { isSuperAdmin: true })).email))
          .accessToken,
      ];
      const leaks: string[] = [];

      for (const route of orgRoutes()) {
        for (const token of tokens) {
          const response = await send(route, fill(route.path, victim.id), token).send({});
          if (response.status !== 403) {
            leaks.push(`${label(route)}: ${response.status}`);
          }
        }
      }

      expect(leaks).toEqual([]);
    });

    it('closes every /admin route to an organization admin', async () => {
      const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      const leaks: string[] = [];

      for (const route of adminRoutes()) {
        const response = await send(route, fill(route.path, ''), admin.accessToken).send({});
        const { code } = response.body as { code?: string };
        if (response.status !== 403 || code !== 'FORBIDDEN') {
          leaks.push(`${label(route)}: ${response.status} ${code}`);
        }
      }

      expect(leaks).toEqual([]);
    });
  });

  describe('object level', () => {
    /** Leaves only what the client sees of an error: an id of B must answer like a random one. */
    const visible = ({ status, body }: { status: number; body: unknown }) => {
      const { code, details } = body as { code?: string; details?: unknown };
      return { status, code, details };
    };

    /** Organization B with one object of every kind an organization route can address by id. */
    interface Victim {
      organizationId: string;
      waterId: string;
      permitTypeId: string;
      permitId: string;
      ruleId: string;
      invitationId: string;
      adminUserId: string;
      speciesId: string;
    }

    interface Case {
      /** Expected answer: the object of B looks unknown on A's path. */
      expect: number;
      params?: (victim: Victim) => Record<string, string>;
      body?: (victim: Victim) => object;
      photo?: boolean;
      /**
       * For a 400: the only field the API complains about. Without it the case could pass on a
       * body that is invalid for another reason (both answers would be the same 400).
       */
      field?: string;
      /** B's object after the attempt: unchanged. */
      unchanged: (victim: Victim) => Promise<void>;
    }

    let attacker: OrgMember;
    let victim: Victim;

    const unchangedWater = async ({ waterId }: Victim) =>
      expect(await prisma.fishingWater.findUniqueOrThrow({ where: { id: waterId } })).toMatchObject(
        { description: 'Opis B', photoKey: null },
      );
    const unchangedType = async ({ permitTypeId }: Victim) =>
      expect(
        await prisma.permitType.findUniqueOrThrow({ where: { id: permitTypeId } }),
      ).toMatchObject({ priceGrosze: 2500, isActive: true });
    const unchangedRule = async ({ ruleId }: Victim) =>
      expect(await prisma.speciesRule.findUniqueOrThrow({ where: { id: ruleId } })).toMatchObject({
        minLengthCm: 40,
      });

    /**
     * Every organization route with an object id. The keys must match the routes of the API
     * document exactly: a new one fails the first test until it gets a case here.
     */
    const CASES: Record<string, Case> = {
      'GET orgs/{orgId}/waters/{id}': {
        expect: 404,
        params: (v) => ({ id: v.waterId }),
        unchanged: unchangedWater,
      },
      'PATCH orgs/{orgId}/waters/{id}': {
        expect: 404,
        params: (v) => ({ id: v.waterId }),
        body: () => ({ description: 'Opis A' }),
        unchanged: unchangedWater,
      },
      'PUT orgs/{orgId}/waters/{id}/photo': {
        expect: 404,
        params: (v) => ({ id: v.waterId }),
        photo: true,
        unchanged: unchangedWater,
      },
      'DELETE orgs/{orgId}/waters/{id}/photo': {
        expect: 404,
        params: (v) => ({ id: v.waterId }),
        unchanged: unchangedWater,
      },
      'GET orgs/{orgId}/permit-types/{id}': {
        expect: 404,
        params: (v) => ({ id: v.permitTypeId }),
        unchanged: unchangedType,
      },
      'PATCH orgs/{orgId}/permit-types/{id}': {
        expect: 404,
        params: (v) => ({ id: v.permitTypeId }),
        body: () => ({ priceGrosze: 1 }),
        unchanged: unchangedType,
      },
      'DELETE orgs/{orgId}/permit-types/{id}': {
        expect: 404,
        params: (v) => ({ id: v.permitTypeId }),
        unchanged: unchangedType,
      },
      'POST orgs/{orgId}/permits/{id}/revoke': {
        expect: 404,
        params: (v) => ({ id: v.permitId }),
        body: () => ({ reason: 'Zwrot' }),
        unchanged: async ({ permitId }) =>
          expect(await prisma.permit.findUniqueOrThrow({ where: { id: permitId } })).toMatchObject({
            status: 'PAID',
            revokedAt: null,
          }),
      },
      'GET orgs/{orgId}/rules/{id}': {
        expect: 404,
        params: (v) => ({ id: v.ruleId }),
        unchanged: unchangedRule,
      },
      'PATCH orgs/{orgId}/rules/{id}': {
        expect: 404,
        params: (v) => ({ id: v.ruleId }),
        body: () => ({ minLengthCm: 10 }),
        unchanged: unchangedRule,
      },
      'DELETE orgs/{orgId}/rules/{id}': {
        expect: 404,
        params: (v) => ({ id: v.ruleId }),
        unchanged: unchangedRule,
      },
      'DELETE orgs/{orgId}/invitations/{id}': {
        expect: 404,
        params: (v) => ({ id: v.invitationId }),
        unchanged: async ({ invitationId }) =>
          expect(await prisma.invitation.count({ where: { id: invitationId } })).toBe(1),
      },
      'PATCH orgs/{orgId}/members/{userId}': {
        expect: 404,
        params: (v) => ({ userId: v.adminUserId }),
        body: () => ({ roles: ['INSPECTOR'] }),
        unchanged: async ({ adminUserId, organizationId }) =>
          expect(
            await prisma.membership.findMany({
              where: { userId: adminUserId },
              select: { organizationId: true, role: true },
            }),
          ).toEqual([{ organizationId, role: 'ORG_ADMIN' }]),
      },
      'DELETE orgs/{orgId}/members/{userId}': {
        expect: 404,
        params: (v) => ({ userId: v.adminUserId }),
        unchanged: async ({ adminUserId }) =>
          expect(await prisma.membership.count({ where: { userId: adminUserId } })).toBe(1),
      },
    };

    /** References to another organization's objects in the body of a create route. */
    const BODY_CASES: Record<string, Case> = {
      // A water reference is a field of the form: 400 on it, as for a water that does not exist.
      'POST orgs/{orgId}/rules (fishingWaterId of B)': {
        expect: 400,
        field: 'fishingWaterId',
        body: (v) => ({ speciesId: v.speciesId, fishingWaterId: v.waterId, minLengthCm: 10 }),
        unchanged: async ({ waterId }) =>
          expect(await prisma.speciesRule.count({ where: { fishingWaterId: waterId } })).toBe(0),
      },
      'POST orgs/{orgId}/permit-types (waterIds of B)': {
        expect: 400,
        field: 'waterIds',
        body: (v) => ({
          name: 'Cudze',
          durationDays: 1,
          priceGrosze: 100,
          discountKind: 'NONE',
          waterIds: [v.waterId],
        }),
        unchanged: async () =>
          expect(await prisma.permitType.count({ where: { name: 'Cudze' } })).toBe(0),
      },
      'POST orgs/{orgId}/inspections (permitId of B)': {
        expect: 404,
        body: (v) => ({ permitId: v.permitId, result: 'OK' }),
        unchanged: async ({ permitId }) =>
          expect(await prisma.inspection.count({ where: { permitId } })).toBe(0),
      },
    };

    beforeAll(async () => {
      attacker = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      // A has a water of its own, so a route that needs one reaches the object check.
      await createWater(prisma, { status: 'CONNECTED', organizationId: attacker.organizationId });

      const organizationId = (await createOrganization(prisma, { status: 'ACTIVE' })).id;
      const water = await createWater(prisma, {
        status: 'CONNECTED',
        organizationId,
        description: 'Opis B',
      });
      const type = await createPermitType(prisma, {
        organizationId,
        waters: { connect: [{ id: water.id }] },
      });
      const permit = await createPermit(prisma, { permitTypeId: type.id, status: 'PAID' });
      const species = await createSpecies(prisma);
      const rule = await prisma.speciesRule.create({
        data: { speciesId: species.id, organizationId, minLengthCm: 40 },
      });
      const invitation = await prisma.invitation.create({
        data: {
          organizationId,
          email: 'zaproszony@example.test',
          role: 'INSPECTOR',
          tokenHash: randomUUID(),
          expiresAt: new Date('2099-01-01'),
        },
      });
      const admin = await createVerifiedUser(prisma);
      await prisma.membership.create({
        data: { userId: admin.id, organizationId, role: 'ORG_ADMIN' },
      });
      victim = {
        organizationId,
        waterId: water.id,
        permitTypeId: type.id,
        permitId: permit.id,
        ruleId: rule.id,
        invitationId: invitation.id,
        adminUserId: admin.id,
        speciesId: species.id,
      };
    });

    it('has a case for every organization route that takes an object id', () => {
      const withObjectId = routes
        .filter(({ path }) => path.startsWith('orgs/{orgId}/') && /\{(?!orgId\})\w+\}/.test(path))
        .map(label)
        .sort();

      expect(withObjectId).toEqual(Object.keys(CASES).sort());
    });

    it.each(Object.entries({ ...CASES, ...BODY_CASES }))(
      '%s: an object of another organization is unknown and stays as it was',
      async (name, testCase) => {
        const [method, path] = name.split(' ') as [string, string];
        const route: Route = { method: method.toLowerCase() as Method, path };
        const attempt = (target: Victim) => {
          const req = send(
            route,
            fill(path, attacker.organizationId, testCase.params?.(target)),
            attacker.accessToken,
          );
          return testCase.photo
            ? req.attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })
            : req.send(testCase.body?.(target) ?? {});
        };
        // The same request naming objects that exist nowhere.
        const nowhere = Object.fromEntries(
          Object.entries(victim).map(([key, value]) => [
            key,
            key === 'organizationId' || key === 'speciesId' ? value : randomUUID(),
          ]),
        ) as unknown as Victim;

        const response = await attempt(victim);

        expect(response.status).toBe(testCase.expect);
        if (testCase.field) {
          const { details } = response.body as { details?: { fields?: object } };
          expect(Object.keys(details?.fields ?? {})).toEqual([testCase.field]);
        }
        expect(visible(response)).toEqual(visible(await attempt(nowhere)));
        await testCase.unchanged(victim);
      },
    );
  });
});
