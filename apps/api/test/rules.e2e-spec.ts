import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization, createSpecies, createWater } from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

// `expect.any()` is typed as `any`; narrowing it keeps the assertions type-checked.
const anyString: unknown = expect.any(String);
const containing = (fields: object): unknown => expect.objectContaining(fields);
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface Rule {
  id: string;
  speciesId: string;
  water: { id: string; name: string } | null;
  minLengthCm: number | null;
  closedFrom: string | null;
  closedTo: string | null;
  dailyLimitCount: number | null;
  dailyLimitWeightG: number | null;
  updatedAt: string;
}

describe('fishing rules', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let admin: OrgMember;
  let superAdminToken: string;
  let pikeId: string;
  let waterId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const orgPath = (suffix = '', organizationId = admin.organizationId) =>
    `/api/v1/orgs/${organizationId}/rules${suffix}`;

  const createOrgRule = (body: object, member: OrgMember = admin) =>
    request(server())
      .post(orgPath('', member.organizationId))
      .set(bearer(member.accessToken))
      .send({ speciesId: pikeId, ...body });

  const createGeneralRule = (body: object) =>
    request(server())
      .post('/api/v1/admin/rules')
      .set(bearer(superAdminToken))
      .send({ speciesId: pikeId, ...body });

  /** Waits until a query of another connection is blocked on a row lock. */
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

  const effective = async (id = waterId) =>
    (await request(server()).get(`/api/v1/waters/${id}/rules`).expect(200)).body as unknown[];

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    ({ accessToken: superAdminToken } = await login(app, superAdmin.email));
    pikeId = (await createSpecies(prisma, { namePl: 'Szczupak' })).id;
    waterId = (
      await createWater(prisma, {
        name: 'Jezioro Białe',
        status: 'CONNECTED',
        organizationId: admin.organizationId,
      })
    ).id;
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('/orgs/:orgId/rules', () => {
    it('creates an organization rule and logs it', async () => {
      const response = await createOrgRule({ minLengthCm: 60, dailyLimitCount: 2 }).expect(201);

      expect(response.body).toEqual({
        id: anyString,
        speciesId: pikeId,
        water: null,
        minLengthCm: 60,
        closedFrom: null,
        closedTo: null,
        dailyLimitCount: 2,
        dailyLimitWeightG: null,
        ineffective: [],
        updatedAt: anyString,
      });
      const stored = await prisma.speciesRule.findUniqueOrThrow({
        where: { id: (response.body as Rule).id },
      });
      expect(stored).toMatchObject({ organizationId: admin.organizationId, fishingWaterId: null });
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          action: 'RULE_CREATED',
          entity: 'SpeciesRule',
          entityId: stored.id,
          diff: containing({ minLengthCm: 60, organizationId: admin.organizationId }),
        }),
      ]);
    });

    it('creates a rule of a connected water', async () => {
      const response = await createOrgRule({
        fishingWaterId: waterId,
        closedFrom: '12-01',
        closedTo: '02-28',
      }).expect(201);

      expect(response.body).toMatchObject({
        water: { id: waterId, name: 'Jezioro Białe' },
        closedFrom: '12-01',
        closedTo: '02-28',
      });
    });

    it.each([
      [
        'a water of another organization',
        async () =>
          (
            await createWater(prisma, {
              status: 'CONNECTED',
              organizationId: (await createOrganization(prisma)).id,
            })
          ).id,
      ],
      ['an unclaimed water', async () => (await createWater(prisma)).id],
    ])('rejects a rule of %s', async (_, water) => {
      const response = await createOrgRule({
        fishingWaterId: await water(),
        minLengthCm: 50,
      }).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { fishingWaterId: [anyString] } },
      });
      expect(await prisma.speciesRule.count()).toBe(0);
    });

    it.each([
      ['restricts nothing', {}, 'rule'],
      ['has half a period', { closedFrom: '01-01' }, 'closedTo'],
      ['has a day that does not exist', { closedFrom: '02-30', closedTo: '03-31' }, 'closedFrom'],
      ['has 29 February', { closedFrom: '02-29', closedTo: '03-31' }, 'closedFrom'],
      ['has a length of 0', { minLengthCm: 0 }, 'minLengthCm'],
      ['has a fractional limit', { dailyLimitCount: 1.5 }, 'dailyLimitCount'],
      ['has a limit over the maximum', { dailyLimitWeightG: 100_001 }, 'dailyLimitWeightG'],
      ['names an unknown species', { speciesId: UNKNOWN_ID, minLengthCm: 50 }, 'speciesId'],
    ])('rejects a rule that %s', async (_, body, field) => {
      const response = await createOrgRule(body).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { [field]: [anyString] } },
      });
    });

    it('accepts zero limits (no-kill) and a rule looser than the general one', async () => {
      await createGeneralRule({ minLengthCm: 50 }).expect(201);

      await createOrgRule({ dailyLimitCount: 0, dailyLimitWeightG: 0 }).expect(201);
      const looser = await createOrgRule({ minLengthCm: 40, dailyLimitCount: 3 }).expect(201);

      expect(looser.body).toMatchObject({ minLengthCm: 40, ineffective: ['minLengthCm'] });
    });

    it('marks parameters of a water rule overridden by the organization or the general rule', async () => {
      await createGeneralRule({ minLengthCm: 50 }).expect(201);
      await createOrgRule({ dailyLimitCount: 2 }).expect(201);
      // A rule of another organization is not above this one.
      const stranger = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      await createOrgRule({ dailyLimitWeightG: 1000 }, stranger).expect(201);
      const waterRule = (
        await createOrgRule({
          fishingWaterId: waterId,
          minLengthCm: 45,
          dailyLimitCount: 4,
          dailyLimitWeightG: 5000,
        }).expect(201)
      ).body as Rule & { ineffective: string[] };

      expect(waterRule.ineffective).toEqual(['minLengthCm', 'dailyLimitCount']);
      const list = await request(server())
        .get(orgPath())
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(
        (list.body as (Rule & { ineffective: string[] })[]).map((rule) => rule.ineffective),
      ).toEqual([[], ['minLengthCm', 'dailyLimitCount']]);
    });

    it('lists the rules of the organization by species, organization rule before waters', async () => {
      const perchId = (await createSpecies(prisma, { namePl: 'Okoń' })).id;
      const other = await createWater(prisma, {
        name: 'Jezioro Anielskie',
        status: 'CONNECTED',
        organizationId: admin.organizationId,
      });
      await createOrgRule({ fishingWaterId: waterId, minLengthCm: 55 }).expect(201);
      await createOrgRule({ fishingWaterId: other.id, minLengthCm: 52 }).expect(201);
      await createOrgRule({ minLengthCm: 50 }).expect(201);
      await createOrgRule({ speciesId: perchId, dailyLimitCount: 5 }).expect(201);
      // Neither a general rule nor a rule of another organization is listed.
      await createGeneralRule({ minLengthCm: 45 }).expect(201);
      const stranger = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      await createOrgRule({ minLengthCm: 70 }, stranger).expect(201);

      const response = await request(server())
        .get(orgPath())
        .set(bearer(admin.accessToken))
        .expect(200);

      expect(
        (response.body as Rule[]).map((rule) => [rule.speciesId, rule.water?.name ?? null]),
      ).toEqual([
        [perchId, null],
        [pikeId, null],
        [pikeId, 'Jezioro Anielskie'],
        [pikeId, 'Jezioro Białe'],
      ]);
    });

    it('changes the sent parameters, clears a null one and logs only the changes', async () => {
      const rule = (await createOrgRule({ minLengthCm: 50, dailyLimitCount: 2 }).expect(201))
        .body as Rule;
      await prisma.auditLog.deleteMany();

      const response = await request(server())
        .patch(orgPath(`/${rule.id}`))
        .set(bearer(admin.accessToken))
        .send({ minLengthCm: 55, dailyLimitCount: null, closedFrom: '05-01', closedTo: '05-31' })
        .expect(200);

      expect(response.body).toMatchObject({
        minLengthCm: 55,
        dailyLimitCount: null,
        closedFrom: '05-01',
        closedTo: '05-31',
        dailyLimitWeightG: null,
      });
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          action: 'RULE_UPDATED',
          entityId: rule.id,
          diff: {
            minLengthCm: { from: 50, to: 55 },
            closedFrom: { from: null, to: '05-01' },
            closedTo: { from: null, to: '05-31' },
            dailyLimitCount: { from: 2, to: null },
          },
        }),
      ]);
    });

    it('writes nothing for an update without changes', async () => {
      const rule = (await createOrgRule({ minLengthCm: 50 }).expect(201)).body as Rule;
      await prisma.auditLog.deleteMany();

      await request(server())
        .patch(orgPath(`/${rule.id}`))
        .set(bearer(admin.accessToken))
        .send({ minLengthCm: 50 })
        .expect(200);

      expect(await prisma.auditLog.count()).toBe(0);
    });

    it.each([
      ['clearing the last parameter', { minLengthCm: null }, 'rule'],
      ['clearing one end of the period', { closedTo: null }, 'closedTo'],
    ])('rejects %s', async (_, change, field) => {
      const rule = (
        await createOrgRule({ minLengthCm: 50, closedFrom: '01-01', closedTo: '04-30' }).expect(201)
      ).body as Rule;
      const only = field === 'rule' ? { closedFrom: null, closedTo: null } : {};

      const response = await request(server())
        .patch(orgPath(`/${rule.id}`))
        .set(bearer(admin.accessToken))
        .send({ ...only, ...change })
        .expect(400);

      expect(response.body).toMatchObject({ details: { fields: { [field]: [anyString] } } });
    });

    it('validates a change against a concurrent one that committed first', async () => {
      const rule = (
        await createOrgRule({ minLengthCm: 50, closedFrom: '01-01', closedTo: '04-30' }).expect(201)
      ).body as Rule;
      await prisma.auditLog.deleteMany();
      // Another change holds the row: it removes the period and commits only once the request
      // below waits for the row. Alone, the request (removing the length) would be valid.
      let locked!: () => void;
      let commit!: () => void;
      const lockedPromise = new Promise<void>((resolve) => (locked = resolve));
      const commitPromise = new Promise<void>((resolve) => (commit = resolve));
      const other = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "SpeciesRule" WHERE "id" = ${rule.id}::uuid FOR UPDATE`;
          await tx.speciesRule.update({
            where: { id: rule.id },
            data: { closedFrom: null, closedTo: null },
          });
          locked();
          await commitPromise;
        },
        { timeout: 20_000 },
      );
      await lockedPromise;
      const response = request(server())
        .patch(orgPath(`/${rule.id}`))
        .set(bearer(admin.accessToken))
        .send({ minLengthCm: null })
        .then((result) => result);
      await untilSomeQueryWaitsForLock();
      commit();
      await other;

      expect((await response).body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { rule: [anyString] } },
      });
      expect(await prisma.speciesRule.findUniqueOrThrow({ where: { id: rule.id } })).toMatchObject({
        minLengthCm: 50,
        closedFrom: null,
      });
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('does not move a rule to another species or water', async () => {
      const rule = (await createOrgRule({ minLengthCm: 50 }).expect(201)).body as Rule;

      await request(server())
        .patch(orgPath(`/${rule.id}`))
        .set(bearer(admin.accessToken))
        .send({ fishingWaterId: waterId })
        .expect(400);
    });

    it('deletes a rule and logs its snapshot', async () => {
      const rule = (await createOrgRule({ minLengthCm: 50 }).expect(201)).body as Rule;
      await prisma.auditLog.deleteMany();

      await request(server())
        .delete(orgPath(`/${rule.id}`))
        .set(bearer(admin.accessToken))
        .expect(204);

      expect(await prisma.speciesRule.count()).toBe(0);
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          action: 'RULE_DELETED',
          entityId: rule.id,
          diff: containing({ minLengthCm: 50, organizationId: admin.organizationId }),
        }),
      ]);
    });

    it('treats a rule of another level as unknown', async () => {
      const generalRule = (await createGeneralRule({ minLengthCm: 45 }).expect(201)).body as Rule;
      const stranger = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      const foreignRule = (await createOrgRule({ minLengthCm: 70 }, stranger).expect(201))
        .body as Rule;

      for (const { id } of [generalRule, foreignRule]) {
        await request(server())
          .get(orgPath(`/${id}`))
          .set(bearer(admin.accessToken))
          .expect(404);
        await request(server())
          .patch(orgPath(`/${id}`))
          .set(bearer(admin.accessToken))
          .send({ minLengthCm: 10 })
          .expect(404);
        await request(server())
          .delete(orgPath(`/${id}`))
          .set(bearer(admin.accessToken))
          .expect(404);
      }
      expect(await prisma.speciesRule.count()).toBe(2);
    });

    it.each([
      ['GET', '', undefined],
      ['POST', '', { speciesId: UNKNOWN_ID, minLengthCm: 50 }],
      ['GET', `/${UNKNOWN_ID}`, undefined],
      ['PATCH', `/${UNKNOWN_ID}`, { minLengthCm: 50 }],
      ['DELETE', `/${UNKNOWN_ID}`, undefined],
    ])('forbids %s %s to the admin of another organization', async (method, suffix, body) => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) => {
        const call = request(server())
          [method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](orgPath(suffix, orgId))
          .set(bearer(token));
        return body ? call.send(body) : call;
      });
    });

    it('forbids a member who is not an admin', async () => {
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');

      await request(server())
        .get(orgPath('', inspector.organizationId))
        .set(bearer(inspector.accessToken))
        .expect(403);
    });
  });

  describe('/admin/rules', () => {
    it('creates, lists, changes and deletes a general rule', async () => {
      const rule = (
        await createGeneralRule({ minLengthCm: 50, closedFrom: '01-01', closedTo: '04-30' }).expect(
          201,
        )
      ).body as Rule;
      await createOrgRule({ minLengthCm: 60 }).expect(201);

      const list = await request(server())
        .get('/api/v1/admin/rules')
        .set(bearer(superAdminToken))
        .expect(200);
      expect((list.body as Rule[]).map(({ id }) => id)).toEqual([rule.id]);

      await request(server())
        .patch(`/api/v1/admin/rules/${rule.id}`)
        .set(bearer(superAdminToken))
        .send({ minLengthCm: 45 })
        .expect(200);
      await request(server())
        .delete(`/api/v1/admin/rules/${rule.id}`)
        .set(bearer(superAdminToken))
        .expect(204);

      expect(
        (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
          ({ action }) => action,
        ),
      ).toEqual(['RULE_CREATED', 'RULE_CREATED', 'RULE_UPDATED', 'RULE_DELETED']);
      expect(await prisma.speciesRule.count({ where: { organizationId: null } })).toBe(0);
    });

    it('rejects a second general rule of a species', async () => {
      await createGeneralRule({ minLengthCm: 50 }).expect(201);

      const response = await createGeneralRule({ minLengthCm: 55 }).expect(409);

      expect(response.body).toMatchObject({
        code: 'RULE_ALREADY_EXISTS',
        details: { speciesId: pikeId },
      });
    });

    it('lets only one of two concurrent general rules of a species in', async () => {
      const responses = await Promise.all([
        createGeneralRule({ minLengthCm: 50 }),
        createGeneralRule({ minLengthCm: 55 }),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(responses.find(({ status }) => status === 409)?.body).toMatchObject({
        code: 'RULE_ALREADY_EXISTS',
      });
      expect(await prisma.speciesRule.count()).toBe(1);
    });

    it('rejects a level in the body of a general rule', async () => {
      await createGeneralRule({ minLengthCm: 50, fishingWaterId: waterId }).expect(400);
    });

    it('does not show a rule of an organization', async () => {
      const rule = (await createOrgRule({ minLengthCm: 60 }).expect(201)).body as Rule;

      await request(server())
        .get(`/api/v1/admin/rules/${rule.id}`)
        .set(bearer(superAdminToken))
        .expect(404);
    });

    it('is only for the super admin', async () => {
      await request(server()).get('/api/v1/admin/rules').set(bearer(admin.accessToken)).expect(403);
      await request(server()).get('/api/v1/admin/rules').expect(401);
    });
  });

  describe('GET /waters/:id/rules', () => {
    it('merges the general, organization and water rules into the strictest', async () => {
      await createGeneralRule({ minLengthCm: 50, closedFrom: '01-01', closedTo: '04-30' });
      await createOrgRule({ minLengthCm: 60, dailyLimitCount: 2 }).expect(201);
      await createOrgRule({
        fishingWaterId: waterId,
        minLengthCm: 55,
        dailyLimitCount: 1,
        closedFrom: '12-01',
        closedTo: '02-28',
      }).expect(201);

      expect(await effective()).toEqual([
        {
          speciesId: pikeId,
          minLengthCm: 60,
          dailyLimitCount: 1,
          dailyLimitWeightG: null,
          closedPeriods: [
            { from: '01-01', to: '04-30' },
            { from: '12-01', to: '02-28' },
          ],
        },
      ]);
    });

    it('ignores rules of other waters and other organizations', async () => {
      const other = await createWater(prisma, {
        status: 'CONNECTED',
        organizationId: admin.organizationId,
      });
      await createOrgRule({ fishingWaterId: other.id, minLengthCm: 70 }).expect(201);
      const stranger = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      await createOrgRule({ minLengthCm: 80 }, stranger).expect(201);

      expect(await effective()).toEqual([]);
    });

    it('applies only general rules on an unconnected water', async () => {
      const unclaimed = await createWater(prisma);
      await createGeneralRule({ minLengthCm: 50 }).expect(201);
      await createOrgRule({ minLengthCm: 60 }).expect(201);

      expect(await effective(unclaimed.id)).toEqual([
        expect.objectContaining({ speciesId: pikeId, minLengthCm: 50 }),
      ]);
    });

    it('keeps the organization rules while the organization is blocked', async () => {
      await createOrgRule({ minLengthCm: 60 }).expect(201);
      await prisma.organization.update({
        where: { id: admin.organizationId },
        data: { status: 'BLOCKED' },
      });

      expect(await effective()).toEqual([expect.objectContaining({ minLengthCm: 60 })]);
    });

    it('drops the rules of a former owner of the water', async () => {
      await createOrgRule({ fishingWaterId: waterId, minLengthCm: 60 }).expect(201);
      const newOwner = await createOrganization(prisma, { status: 'ACTIVE' });
      await prisma.fishingWater.update({
        where: { id: waterId },
        data: { organizationId: newOwner.id },
      });

      expect(await effective()).toEqual([]);
    });

    it('lists species by Polish name', async () => {
      const perch = await createSpecies(prisma, { namePl: 'Okoń' });
      await createGeneralRule({ minLengthCm: 50 }).expect(201);
      await createGeneralRule({ speciesId: perch.id, dailyLimitCount: 10 }).expect(201);

      expect((await effective()).map((rule) => (rule as Rule).speciesId)).toEqual([
        perch.id,
        pikeId,
      ]);
    });

    it('is not found for an unknown or unpublished water and rejects a non-UUID', async () => {
      const suggestion = await createWater(prisma, { isPublished: false });

      await request(server()).get(`/api/v1/waters/${UNKNOWN_ID}/rules`).expect(404);
      await request(server()).get(`/api/v1/waters/${suggestion.id}/rules`).expect(404);
      await request(server()).get('/api/v1/waters/not-a-uuid/rules').expect(400);
    });
  });
});
