import { LOWEST_PRICES_MAX_WATERS } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createOrganization,
  createPermit,
  createPermitType,
  createUser,
  createWater,
} from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

// `expect.any()` is typed as `any`; narrowing it keeps the assertions type-checked.
const anyString: unknown = expect.any(String);
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface OrgPermitType {
  id: string;
  name: string;
  durationDays: number;
  priceGrosze: number;
  discountKind: string;
  isActive: boolean;
  inUse: boolean;
  waters: { id: string; name: string }[];
  createdAt: string;
}

describe('permit types', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let admin: OrgMember;
  let waterId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const path = (suffix = '', member: Pick<OrgMember, 'organizationId'> = admin) =>
    `/api/v1/orgs/${member.organizationId}/permit-types${suffix}`;

  const body = (change: object = {}) => ({
    name: 'Dzienne',
    durationDays: 1,
    priceGrosze: 2500,
    discountKind: 'NONE',
    waterIds: [waterId],
    ...change,
  });

  const create = (change: object = {}, member: OrgMember = admin) =>
    request(server()).post(path('', member)).set(bearer(member.accessToken)).send(body(change));

  const createType = async (change: object = {}): Promise<OrgPermitType> =>
    (await create(change).expect(201)).body as OrgPermitType;

  const patch = (id: string, change: object) =>
    request(server())
      .patch(path(`/${id}`))
      .set(bearer(admin.accessToken))
      .send(change);

  const remove = (id: string) =>
    request(server())
      .delete(path(`/${id}`))
      .set(bearer(admin.accessToken));

  const connectedWater = (organizationId: string, data: object = {}) =>
    createWater(prisma, { status: 'CONNECTED', organizationId, ...data });

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

  /**
   * Runs `action` while a permit of the type is being sold: the Permit row is inserted in an
   * open transaction that commits only after `action` has reached the lock of the type.
   */
  const duringSale = async (permitTypeId: string, action: () => request.Test) => {
    const angler = await createUser(prisma);
    let inserted!: () => void;
    let commit!: () => void;
    const insertedPromise = new Promise<void>((resolve) => (inserted = resolve));
    const commitPromise = new Promise<void>((resolve) => (commit = resolve));
    const sale = prisma.$transaction(
      async (tx) => {
        await tx.permit.create({
          data: {
            number: 'ZW-2026-000001',
            userId: angler.id,
            permitTypeId,
            validFrom: new Date('2026-10-07'),
            validTo: new Date('2026-10-07'),
            pricePaidGrosze: 2500,
          },
        });
        inserted();
        await commitPromise;
      },
      { timeout: 20_000 },
    );
    await insertedPromise;
    const response = action().then((result) => result);
    await untilSomeQueryWaitsForLock();
    commit();
    await sale;
    return response;
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    waterId = (await connectedWater(admin.organizationId, { name: 'Jezioro Białe' })).id;
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /orgs/:orgId/permit-types', () => {
    it('creates a type for connected waters of the organization and records it', async () => {
      const other = await connectedWater(admin.organizationId, { name: 'Jezioro Arłamowskie' });

      const response = await create({
        name: '  Tygodniowe junior ',
        durationDays: 7,
        priceGrosze: 4000,
        discountKind: 'JUNIOR',
        waterIds: [waterId, other.id],
      }).expect(201);

      expect(response.body).toEqual({
        id: anyString,
        name: 'Tygodniowe junior',
        durationDays: 7,
        priceGrosze: 4000,
        discountKind: 'JUNIOR',
        isActive: true,
        inUse: false,
        waters: [
          { id: other.id, name: 'Jezioro Arłamowskie' },
          { id: waterId, name: 'Jezioro Białe' },
        ],
        createdAt: anyString,
      });
      const { id } = response.body as OrgPermitType;
      const stored = await prisma.permitType.findUniqueOrThrow({
        where: { id },
        include: { waters: { select: { id: true }, orderBy: { name: 'asc' } } },
      });
      expect(stored.organizationId).toBe(admin.organizationId);
      expect(stored.waters).toEqual([{ id: other.id }, { id: waterId }]);
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          action: 'PERMIT_TYPE_CREATED',
          entity: 'PermitType',
          entityId: id,
          diff: {
            name: 'Tygodniowe junior',
            durationDays: 7,
            priceGrosze: 4000,
            discountKind: 'JUNIOR',
            waterIds: [waterId, other.id],
          },
        }),
      ]);
    });

    it('accepts a free type', async () => {
      await create({ priceGrosze: 0 }).expect(201);
    });

    it.each([
      ['an unclaimed water', () => createWater(prisma)],
      [
        'a water of another organization',
        async () => connectedWater((await createOrganization(prisma, { status: 'ACTIVE' })).id),
      ],
      ['an unknown water', () => Promise.resolve({ id: UNKNOWN_ID })],
    ])('rejects %s and creates nothing', async (_case, makeWater) => {
      const foreign = await makeWater();

      const response = await create({ waterIds: [waterId, foreign.id] }).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { waterIds: [expect.stringContaining('not connected')] } },
      });
      expect(await prisma.permitType.count()).toBe(0);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it.each([
      ['no water', () => ({ waterIds: [] })],
      ['a water twice', () => ({ waterIds: [waterId, waterId] })],
      ['a negative price', () => ({ priceGrosze: -1 })],
      ['a price in złoty', () => ({ priceGrosze: 25.5 })],
      ['a price as text', () => ({ priceGrosze: '2500' })],
      ['zero days', () => ({ durationDays: 0 })],
      ['more than a leap year', () => ({ durationDays: 367 })],
      ['an empty name', () => ({ name: '  ' })],
      ['an unknown discount', () => ({ discountKind: 'STUDENT' })],
      ['an unknown field', () => ({ isActive: false, organizationId: UNKNOWN_ID })],
    ])('rejects %s', async (_case, change) => {
      const response = await create(change()).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await prisma.permitType.count()).toBe(0);
    });

    it('is closed to an inspector of the organization', async () => {
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');

      const response = await create({}, inspector).expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('is closed to the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .post(path('', { organizationId: orgId }))
          .set(bearer(token))
          .send(body()),
      );
    });
  });

  describe('GET /orgs/:orgId/permit-types', () => {
    it('lists the types of the organization, active first, with their state', async () => {
      const yearly = await createType({ name: 'Roczne', durationDays: 365 });
      await patch(yearly.id, { isActive: false }).expect(200);
      const weekly = await createType({ name: 'Tygodniowe', durationDays: 7 });
      const daily = await createType({ name: 'Dzienne' });
      await createPermit(prisma, { permitTypeId: daily.id });
      // Another organization's type is not listed.
      await createPermitType(prisma);

      const response = await request(server())
        .get(path())
        .set(bearer(admin.accessToken))
        .expect(200);

      const types = response.body as OrgPermitType[];
      expect(types.map(({ id, isActive, inUse }) => ({ id, isActive, inUse }))).toEqual([
        { id: daily.id, isActive: true, inUse: true },
        { id: weekly.id, isActive: true, inUse: false },
        { id: yearly.id, isActive: false, inUse: false },
      ]);
      expect(types[0]?.waters).toEqual([{ id: waterId, name: 'Jezioro Białe' }]);
    });

    it('is closed to the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .get(path('', { organizationId: orgId }))
          .set(bearer(token)),
      );
    });
  });

  describe('GET /orgs/:orgId/permit-types/:id', () => {
    it('returns a type of the organization', async () => {
      const type = await createType();

      const response = await request(server())
        .get(path(`/${type.id}`))
        .set(bearer(admin.accessToken))
        .expect(200);

      expect(response.body).toEqual(type);
    });

    it('does not show a type of another organization', async () => {
      const foreign = await createPermitType(prisma);

      const response = await request(server())
        .get(path(`/${foreign.id}`))
        .set(bearer(admin.accessToken))
        .expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects an id that is not a UUID', async () => {
      await request(server()).get(path('/1')).set(bearer(admin.accessToken)).expect(400);
    });

    it('is closed to the admin of another organization', async () => {
      const type = await createPermitType(prisma);

      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .get(path(`/${type.id}`, { organizationId: orgId }))
          .set(bearer(token)),
      );
    });
  });

  describe('PATCH /orgs/:orgId/permit-types/:id', () => {
    it('changes any field of a type nobody has bought and records what changed', async () => {
      const type = await createType();
      const other = await connectedWater(admin.organizationId, { name: 'Jezioro Czarne' });
      await prisma.auditLog.deleteMany();

      const response = await patch(type.id, {
        name: 'Dzienne senior',
        durationDays: 2,
        priceGrosze: 1500,
        discountKind: 'SENIOR',
        waterIds: [other.id],
        isActive: false,
      }).expect(200);

      expect(response.body).toMatchObject({
        name: 'Dzienne senior',
        durationDays: 2,
        priceGrosze: 1500,
        discountKind: 'SENIOR',
        isActive: false,
        waters: [{ id: other.id, name: 'Jezioro Czarne' }],
      });
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          action: 'PERMIT_TYPE_UPDATED',
          entityId: type.id,
          diff: {
            name: { from: 'Dzienne', to: 'Dzienne senior' },
            durationDays: { from: 1, to: 2 },
            priceGrosze: { from: 2500, to: 1500 },
            discountKind: { from: 'NONE', to: 'SENIOR' },
            waterIds: { from: [waterId], to: [other.id] },
            isActive: { from: true, to: false },
          },
        }),
      ]);
    });

    it('lets a sold type change its name, price and activity', async () => {
      const type = await createType();
      await createPermit(prisma, { permitTypeId: type.id });

      const response = await patch(type.id, {
        name: 'Dzienne 2027',
        priceGrosze: 3000,
        isActive: false,
      }).expect(200);

      expect(response.body).toMatchObject({
        name: 'Dzienne 2027',
        priceGrosze: 3000,
        isActive: false,
        inUse: true,
      });
    });

    it.each([
      ['durationDays', { durationDays: 2 }],
      ['discountKind', { discountKind: 'JUNIOR' }],
      ['waterIds', { waterIds: ['OTHER'] }],
    ])('keeps %s of a sold type', async (field, change) => {
      const type = await createType();
      const other = await connectedWater(admin.organizationId);
      await createPermit(prisma, { permitTypeId: type.id });
      await prisma.auditLog.deleteMany();
      const resolved = 'waterIds' in change ? { waterIds: [waterId, other.id] } : change;

      const response = await patch(type.id, { ...resolved, priceGrosze: 9900 }).expect(409);

      expect(response.body).toMatchObject({
        code: 'PERMIT_TYPE_IN_USE',
        details: { lockedFields: [field] },
      });
      // Nothing of the request is applied, the price included.
      expect(
        await request(server())
          .get(path(`/${type.id}`))
          .set(bearer(admin.accessToken))
          .then((result) => result.body as OrgPermitType),
      ).toEqual({ ...type, inUse: true });
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('accepts the whole form of a sold type when its terms are sent unchanged', async () => {
      const type = await createType();
      await createPermit(prisma, { permitTypeId: type.id });

      const response = await patch(type.id, body({ priceGrosze: 2700 })).expect(200);

      expect(response.body).toMatchObject({ priceGrosze: 2700, waters: type.waters });
    });

    it('records nothing when nothing changes', async () => {
      const type = await createType();
      await prisma.auditLog.deleteMany();

      await patch(type.id, body()).expect(200);

      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('rejects a water that is not connected to the organization', async () => {
      const type = await createType();
      const unclaimed = await createWater(prisma);

      const response = await patch(type.id, { waterIds: [unclaimed.id] }).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('does not change a type of another organization', async () => {
      const foreign = await createPermitType(prisma);

      await patch(foreign.id, { priceGrosze: 1 }).expect(404);

      expect(
        (await prisma.permitType.findUniqueOrThrow({ where: { id: foreign.id } })).priceGrosze,
      ).toBe(2500);
    });

    it('waits for a sale in progress and then keeps the waters it sold', async () => {
      const type = await createType();
      const other = await connectedWater(admin.organizationId);

      const response = await duringSale(type.id, () => patch(type.id, { waterIds: [other.id] }));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'PERMIT_TYPE_IN_USE' });
      const stored = await prisma.permitType.findUniqueOrThrow({
        where: { id: type.id },
        include: { waters: { select: { id: true } } },
      });
      expect(stored.waters).toEqual([{ id: waterId }]);
    });

    it('is closed to the admin of another organization', async () => {
      const type = await createPermitType(prisma);

      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .patch(path(`/${type.id}`, { organizationId: orgId }))
          .set(bearer(token))
          .send({ priceGrosze: 1 }),
      );
    });
  });

  describe('DELETE /orgs/:orgId/permit-types/:id', () => {
    it('deletes a type nobody has bought, with its links to waters', async () => {
      const type = await createType();

      await remove(type.id).expect(204);

      expect(await prisma.permitType.count()).toBe(0);
      expect(
        await prisma.fishingWater.findUniqueOrThrow({
          where: { id: waterId },
          include: { permitTypes: true },
        }),
      ).toMatchObject({ permitTypes: [] });
      expect(await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).toEqual([
        expect.objectContaining({ action: 'PERMIT_TYPE_CREATED' }),
        expect.objectContaining({
          action: 'PERMIT_TYPE_DELETED',
          entityId: type.id,
          diff: {
            name: 'Dzienne',
            durationDays: 1,
            priceGrosze: 2500,
            discountKind: 'NONE',
            waterIds: [waterId],
            isActive: true,
          },
        }),
      ]);
    });

    it('keeps a sold type', async () => {
      const type = await createType();
      await createPermit(prisma, { permitTypeId: type.id, status: 'CANCELLED' });

      const response = await remove(type.id).expect(409);

      expect(response.body).toMatchObject({ code: 'PERMIT_TYPE_IN_USE' });
      expect(await prisma.permitType.count()).toBe(1);
    });

    it('waits for a sale in progress and then keeps the type', async () => {
      const type = await createType();

      const response = await duringSale(type.id, () => remove(type.id));

      expect(response.status).toBe(409);
      expect(await prisma.permitType.count()).toBe(1);
    });

    it('does not delete a type of another organization', async () => {
      const foreign = await createPermitType(prisma);

      await remove(foreign.id).expect(404);

      expect(await prisma.permitType.count()).toBe(1);
    });

    it('is closed to the admin of another organization', async () => {
      const type = await createPermitType(prisma);

      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server())
          .delete(path(`/${type.id}`, { organizationId: orgId }))
          .set(bearer(token)),
      );
    });
  });

  describe('GET /permit-types?waterId=', () => {
    const offer = (id: string) =>
      request(server()).get('/api/v1/permit-types').query({ waterId: id });

    it('lists the active types of the water for a guest, shortest first', async () => {
      const otherWater = await connectedWater(admin.organizationId);
      const yearly = await createType({ name: 'Roczne', durationDays: 365, priceGrosze: 50000 });
      const junior = await createType({ name: 'Dzienne junior', discountKind: 'JUNIOR' });
      const daily = await createType({ name: 'Dzienne' });
      const stopped = await createType({ name: 'Weekendowe', durationDays: 2 });
      await patch(stopped.id, { isActive: false }).expect(200);
      await createType({ name: 'Inne łowisko', waterIds: [otherWater.id] });

      const response = await offer(waterId).expect(200);

      expect(response.body).toEqual([
        { id: daily.id, name: 'Dzienne', durationDays: 1, priceGrosze: 2500, discountKind: 'NONE' },
        {
          id: junior.id,
          name: 'Dzienne junior',
          durationDays: 1,
          priceGrosze: 2500,
          discountKind: 'JUNIOR',
        },
        {
          id: yearly.id,
          name: 'Roczne',
          durationDays: 365,
          priceGrosze: 50000,
          discountKind: 'NONE',
        },
      ]);
    });

    it('offers nothing on an unclaimed water', async () => {
      const unclaimed = await createWater(prisma);

      await offer(unclaimed.id).expect(200, []);
    });

    it('offers nothing while the organization is blocked', async () => {
      await createType();
      await prisma.organization.update({
        where: { id: admin.organizationId },
        data: { status: 'BLOCKED' },
      });

      await offer(waterId).expect(200, []);
    });

    it('does not know an unknown or unpublished water', async () => {
      const suggestion = await createWater(prisma, { isPublished: false });

      await offer(UNKNOWN_ID).expect(404);
      await offer(suggestion.id).expect(404);
    });

    it('requires a water id', async () => {
      await request(server()).get('/api/v1/permit-types').expect(400);
      await offer('jezioro').expect(400);
    });
  });

  describe('GET /permit-types/lowest-prices', () => {
    const lowest = (ids: string) =>
      request(server()).get('/api/v1/permit-types/lowest-prices').query({ waterIds: ids });

    it('gives the lowest regular price of each water on sale, in the order asked', async () => {
      const second = await connectedWater(admin.organizationId);
      const withoutTypes = await connectedWater(admin.organizationId);
      await createType({ priceGrosze: 2500, waterIds: [waterId, second.id] });
      await createType({ priceGrosze: 1800, waterIds: [second.id] });
      // Neither a discounted nor a stopped type is the «od» price.
      await createType({ priceGrosze: 500, discountKind: 'JUNIOR' });
      const stopped = await createType({ priceGrosze: 100 });
      await patch(stopped.id, { isActive: false }).expect(200);

      const response = await lowest([second.id, withoutTypes.id, waterId].join(',')).expect(200);

      expect(response.body).toEqual([
        { waterId: second.id, priceGrosze: 1800 },
        { waterId, priceGrosze: 2500 },
      ]);
    });

    it('leaves out the waters of a blocked organization', async () => {
      const blocked = await createOrganization(prisma, { status: 'BLOCKED' });
      const water = await connectedWater(blocked.id);
      await createPermitType(prisma, {
        organizationId: blocked.id,
        waters: { connect: [{ id: water.id }] },
      });

      await lowest(water.id).expect(200, []);
    });

    it.each([
      ['no ids', ''],
      ['an id that is not a UUID', `${UNKNOWN_ID},jezioro`],
      [
        `more than ${LOWEST_PRICES_MAX_WATERS} ids`,
        Array.from({ length: LOWEST_PRICES_MAX_WATERS + 1 }, () => UNKNOWN_ID).join(','),
      ],
    ])('rejects %s', async (_case, ids) => {
      await lowest(ids).expect(400);
    });
  });

  describe('GET /orgs/:orgId/waters', () => {
    it('lists the waters connected to the organization by name', async () => {
      const second = await connectedWater(admin.organizationId, { name: 'Jezioro Arłamowskie' });
      await createWater(prisma, { name: 'Jezioro Wolne' });
      await connectedWater((await createOrganization(prisma)).id);

      const response = await request(server())
        .get(`/api/v1/orgs/${admin.organizationId}/waters`)
        .set(bearer(admin.accessToken))
        .expect(200);

      expect(response.body).toEqual([
        { id: second.id, name: 'Jezioro Arłamowskie', type: 'LAKE', region: 'mazowieckie' },
        { id: waterId, name: 'Jezioro Białe', type: 'LAKE', region: 'mazowieckie' },
      ]);
    });

    it('is closed to the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/waters`).set(bearer(token)),
      );
    });
  });
});
