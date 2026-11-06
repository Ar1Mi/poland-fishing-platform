import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { hashOpaqueToken } from '../src/modules/auth/opaque-token';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { FakeMailTransport } from './mail/fake-mail-transport';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Member {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: string[];
  since: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  expired: boolean;
}

describe('members and invitations (FR-04)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let mail: FakeMailTransport;
  let now: Date;
  let admin: OrgMember;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const orgPath = (path: string, member = admin) => `/api/v1/orgs/${member.organizationId}/${path}`;
  const invite = (body: Record<string, unknown>, member = admin) =>
    request(server())
      .post(orgPath('invitations', member))
      .set(bearer(member.accessToken))
      .send(body);
  const accept = (token: string, accessToken: string) =>
    request(server()).post('/api/v1/invitations/accept').set(bearer(accessToken)).send({ token });
  const members = async (member = admin) =>
    (
      await request(server())
        .get(orgPath('members', member))
        .set(bearer(member.accessToken))
        .expect(200)
    ).body as Member[];
  /** A logged-in account with this address and no role yet. */
  const account = async (email: string, data: Record<string, unknown> = {}) => {
    const user = await createVerifiedUser(prisma, { email, ...data });
    return { ...user, accessToken: (await login(app, email)).accessToken };
  };

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
    mail = new FakeMailTransport();
    now = FIXED_NOW;
    app = await createTestApp({ prisma, mail, now: () => now });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('invitations', () => {
    it('emails a link that makes the invited account an inspector', async () => {
      const created = await invite({ email: ' Straznik@Example.com ', role: 'INSPECTOR' }).expect(
        201,
      );

      expect(created.body).toEqual({
        id: expect.any(String) as unknown,
        email: 'straznik@example.com',
        role: 'INSPECTOR',
        expiresAt: new Date(FIXED_NOW.getTime() + 7 * DAY_MS).toISOString(),
        expired: false,
      });
      const [message] = mail.to('straznik@example.com');
      const organization = await prisma.organization.findUniqueOrThrow({
        where: { id: admin.organizationId },
      });
      expect(message?.subject).toContain(organization.name);
      expect(message?.text).toContain('http://localhost:5173/invitations/accept?token=');
      // The token is stored only as its hash.
      const token = mail.tokenFor('straznik@example.com');
      const stored = await prisma.invitation.findFirstOrThrow();
      expect(stored.tokenHash).toBe(hashOpaqueToken(token));
      expect(JSON.stringify(stored)).not.toContain(token);

      const inspector = await account('straznik@example.com');
      const accepted = await accept(token, inspector.accessToken).expect(200);

      expect(accepted.body).toEqual({
        organization: { id: admin.organizationId, name: organization.name },
        role: 'INSPECTOR',
      });
      expect(
        await prisma.membership.findMany({
          where: { userId: inspector.id },
          select: { organizationId: true, role: true },
        }),
      ).toEqual([{ organizationId: admin.organizationId, role: 'INSPECTOR' }]);
      // The angler now sees the organization and may check permits for it.
      const mine = await request(server())
        .get('/api/v1/me/orgs')
        .set(bearer(inspector.accessToken))
        .expect(200);
      expect(mine.body).toMatchObject([{ id: admin.organizationId, roles: ['INSPECTOR'] }]);
      expect(
        (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => [
          e.action,
          e.actorId,
        ]),
      ).toEqual([
        ['INVITATION_CREATED', admin.userId],
        ['INVITATION_ACCEPTED', inspector.id],
      ]);
    });

    it('writes the email in the language of an existing account and in Polish otherwise', async () => {
      await createVerifiedUser(prisma, { email: 'en@example.com', locale: 'en' });

      await invite({ email: 'en@example.com', role: 'ORG_ADMIN' }).expect(201);
      await invite({ email: 'new@example.com', role: 'INSPECTOR' }).expect(201);

      expect(mail.to('en@example.com')[0]?.subject).toMatch(/^Invitation to /);
      expect(mail.to('new@example.com')[0]?.subject).toMatch(/^Zaproszenie do organizacji /);
    });

    it('lists pending invitations, expired ones marked, and leaves out accepted ones', async () => {
      await invite({ email: 'old@example.com', role: 'INSPECTOR' }).expect(201);
      now = new Date(FIXED_NOW.getTime() + 8 * DAY_MS);
      await app.close();
      app = await createTestApp({ prisma, mail, now: () => now });
      admin = {
        ...admin,
        accessToken: (
          await login(
            app,
            (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).email,
          )
        ).accessToken,
      };
      await invite({ email: 'taken@example.com', role: 'INSPECTOR' }).expect(201);
      const taker = await account('taken@example.com');
      await accept(mail.tokenFor('taken@example.com'), taker.accessToken).expect(200);
      await invite({ email: 'new@example.com', role: 'ORG_ADMIN' }).expect(201);

      const list = await request(server())
        .get(orgPath('invitations'))
        .set(bearer(admin.accessToken))
        .expect(200);

      expect(
        (list.body as Invitation[]).map(({ email, role, expired }) => [email, role, expired]),
      ).toEqual([
        ['new@example.com', 'ORG_ADMIN', false],
        ['old@example.com', 'INSPECTOR', true],
      ]);
    });

    it('replaces the pending invitation of the same address and role: only the new link works', async () => {
      await invite({ email: 'a@example.com', role: 'INSPECTOR' }).expect(201);
      const first = mail.tokenFor('a@example.com');
      await invite({ email: 'a@example.com', role: 'INSPECTOR' }).expect(201);
      const second = mail.tokenFor('a@example.com');
      // Another role is another invitation.
      await invite({ email: 'a@example.com', role: 'ORG_ADMIN' }).expect(201);

      expect(await prisma.invitation.count()).toBe(2);
      const invitee = await account('a@example.com');
      const old = await accept(first, invitee.accessToken).expect(400);
      expect(old.body).toMatchObject({ code: 'INVALID_TOKEN' });
      await accept(second, invitee.accessToken).expect(200);
    });

    it('keeps one pending invitation when the same one is sent twice at once', async () => {
      await Promise.all([
        invite({ email: 'twice@example.com', role: 'INSPECTOR' }).expect(201),
        invite({ email: 'twice@example.com', role: 'INSPECTOR' }).expect(201),
      ]);

      expect(await prisma.invitation.count({ where: { email: 'twice@example.com' } })).toBe(1);
    });

    it('refuses to invite someone who already holds the role', async () => {
      const response = await invite({
        email: (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).email,
        role: 'ORG_ADMIN',
      }).expect(409);

      expect(response.body).toMatchObject({
        code: 'ALREADY_MEMBER',
        details: { role: 'ORG_ADMIN' },
      });
      expect(mail.sent).toEqual([]);
    });

    it('refuses a malformed address or role', async () => {
      await invite({ email: 'not-an-email', role: 'INSPECTOR' }).expect(400);
      await invite({ email: 'a@example.com', role: 'ANGLER' }).expect(400);
      await invite({ email: 'a@example.com' }).expect(400);
    });

    it('keeps the invitation when the email cannot be sent', async () => {
      mail.failNext = true;

      await invite({ email: 'a@example.com', role: 'INSPECTOR' }).expect(201);

      expect(await prisma.invitation.count()).toBe(1);
    });

    it('cancels a pending invitation: its link stops working', async () => {
      const created = await invite({ email: 'a@example.com', role: 'INSPECTOR' }).expect(201);
      const token = mail.tokenFor('a@example.com');

      await request(server())
        .delete(orgPath(`invitations/${(created.body as Invitation).id}`))
        .set(bearer(admin.accessToken))
        .expect(204);

      const invitee = await account('a@example.com');
      await accept(token, invitee.accessToken).expect(400);
      expect((await prisma.auditLog.findMany()).map((entry) => entry.action)).toContain(
        'INVITATION_CANCELLED',
      );
    });

    it('cancels neither an accepted invitation nor one of another organization', async () => {
      const created = await invite({ email: 'a@example.com', role: 'INSPECTOR' }).expect(201);
      const id = (created.body as Invitation).id;
      const foreign = await loginOrgMember(app, prisma, 'ORG_ADMIN');

      await request(server())
        .delete(orgPath(`invitations/${id}`, foreign))
        .set(bearer(foreign.accessToken))
        .expect(404);
      const invitee = await account('a@example.com');
      await accept(mail.tokenFor('a@example.com'), invitee.accessToken).expect(200);
      await request(server())
        .delete(orgPath(`invitations/${id}`))
        .set(bearer(admin.accessToken))
        .expect(404);
      await request(server())
        .delete(orgPath('invitations/not-a-uuid'))
        .set(bearer(admin.accessToken))
        .expect(400);
    });
  });

  describe('POST /invitations/accept', () => {
    let token: string;

    beforeEach(async () => {
      await invite({ email: 'invitee@example.com', role: 'INSPECTOR' }).expect(201);
      token = mail.tokenFor('invitee@example.com');
    });

    it('refuses an account with another address, and the link still works for the right one', async () => {
      const other = await account('other@example.com');

      const response = await accept(token, other.accessToken).expect(403);

      expect(response.body).toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
      expect(await prisma.membership.count({ where: { userId: other.id } })).toBe(0);
      const invitee = await account('invitee@example.com');
      await accept(token, invitee.accessToken).expect(200);
    });

    it('uses a link once and refuses a made-up one', async () => {
      const invitee = await account('invitee@example.com');
      await accept(token, invitee.accessToken).expect(200);

      const again = await accept(token, invitee.accessToken).expect(400);
      expect(again.body).toMatchObject({ code: 'INVALID_TOKEN' });
      const made = await accept('made-up-token', invitee.accessToken).expect(400);
      expect(made.body).toMatchObject({ code: 'INVALID_TOKEN' });
    });

    it('accepts a link opened twice at once only once', async () => {
      const invitee = await account('invitee@example.com');

      const statuses = (
        await Promise.all([accept(token, invitee.accessToken), accept(token, invitee.accessToken)])
      ).map((response) => response.status);

      expect(statuses.sort()).toEqual([200, 400]);
      expect(await prisma.membership.count({ where: { userId: invitee.id } })).toBe(1);
    });

    it('refuses an expired link with its own code', async () => {
      now = new Date(FIXED_NOW.getTime() + 7 * DAY_MS);
      const invitee = await account('invitee@example.com');

      const response = await accept(token, invitee.accessToken).expect(422);

      expect(response.body).toMatchObject({ code: 'INVITATION_EXPIRED' });
      expect(await prisma.membership.count({ where: { userId: invitee.id } })).toBe(0);
    });

    it('needs a login', async () => {
      await request(server()).post('/api/v1/invitations/accept').send({ token }).expect(401);
    });
  });

  describe('members', () => {
    let inspector: Awaited<ReturnType<typeof account>>;

    beforeEach(async () => {
      inspector = await account('piotr@example.com', { firstName: 'Piotr', lastName: 'Zieliński' });
      await prisma.membership.create({
        data: { userId: inspector.id, organizationId: admin.organizationId, role: 'INSPECTOR' },
      });
    });

    const setRoles = (userId: string, roles: unknown, member = admin) =>
      request(server())
        .patch(orgPath(`members/${userId}`, member))
        .set(bearer(member.accessToken))
        .send({ roles });
    const remove = (userId: string, member = admin) =>
      request(server())
        .delete(orgPath(`members/${userId}`, member))
        .set(bearer(member.accessToken));

    it('lists every member once with all roles, by last name', async () => {
      await prisma.membership.create({
        data: { userId: inspector.id, organizationId: admin.organizationId, role: 'ORG_ADMIN' },
      });
      await prisma.user.update({ where: { id: admin.userId }, data: { lastName: 'Adamska' } });

      const list = await members();

      expect(list.map(({ lastName, roles }) => [lastName, roles])).toEqual([
        ['Adamska', ['ORG_ADMIN']],
        ['Zieliński', ['ORG_ADMIN', 'INSPECTOR']],
      ]);
      expect(list[1]).toMatchObject({ firstName: 'Piotr', email: 'piotr@example.com' });
    });

    it('changes the roles of a member and logs the change', async () => {
      const response = await setRoles(inspector.id, ['ORG_ADMIN', 'INSPECTOR']).expect(200);

      expect(response.body).toMatchObject({
        userId: inspector.id,
        roles: ['ORG_ADMIN', 'INSPECTOR'],
      });
      await setRoles(inspector.id, ['ORG_ADMIN']).expect(200);
      expect((await members()).find((m) => m.userId === inspector.id)?.roles).toEqual([
        'ORG_ADMIN',
      ]);
      expect(
        (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => e.diff),
      ).toEqual([
        { userId: inspector.id, from: ['INSPECTOR'], to: ['ORG_ADMIN', 'INSPECTOR'] },
        { userId: inspector.id, from: ['ORG_ADMIN', 'INSPECTOR'], to: ['ORG_ADMIN'] },
      ]);
    });

    it('writes nothing when the roles stay the same', async () => {
      await setRoles(inspector.id, ['INSPECTOR']).expect(200);

      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('refuses no roles, a repeated or unknown role', async () => {
      await setRoles(inspector.id, []).expect(400);
      await setRoles(inspector.id, ['INSPECTOR', 'INSPECTOR']).expect(400);
      await setRoles(inspector.id, ['ANGLER']).expect(400);
    });

    it('removes a member with every role', async () => {
      await remove(inspector.id).expect(204);

      expect((await members()).map((member) => member.userId)).toEqual([admin.userId]);
      expect(await prisma.auditLog.findFirst()).toMatchObject({
        action: 'MEMBER_REMOVED',
        entity: 'Organization',
        entityId: admin.organizationId,
        diff: { userId: inspector.id, roles: ['INSPECTOR'] },
      });
    });

    it('keeps the last admin: neither removed nor demoted, the admin themself included', async () => {
      const demoted = await setRoles(admin.userId, ['INSPECTOR']).expect(409);
      expect(demoted.body).toMatchObject({ code: 'LAST_ORG_ADMIN' });
      const removed = await remove(admin.userId).expect(409);
      expect(removed.body).toMatchObject({ code: 'LAST_ORG_ADMIN' });

      // With a second admin, the first may leave.
      await setRoles(inspector.id, ['ORG_ADMIN']).expect(200);
      await remove(admin.userId).expect(204);
    });

    it('keeps one admin when two admins remove each other at once', async () => {
      await setRoles(inspector.id, ['ORG_ADMIN']).expect(200);
      // The first removal (of the inspector) holds the organization and commits only once the
      // second (of the admin, by the inspector) waits for it.
      let locked!: () => void;
      let commit!: () => void;
      const lockedPromise = new Promise<void>((resolve) => (locked = resolve));
      const commitPromise = new Promise<void>((resolve) => (commit = resolve));
      const first = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "id" FROM "Organization" WHERE "id" = ${admin.organizationId}::uuid
            FOR NO KEY UPDATE`;
          await tx.membership.deleteMany({
            where: { organizationId: admin.organizationId, userId: inspector.id },
          });
          locked();
          await commitPromise;
        },
        { timeout: 20_000 },
      );
      await lockedPromise;
      const second = remove(admin.userId, {
        userId: inspector.id,
        organizationId: admin.organizationId,
        accessToken: inspector.accessToken,
      }).then((result) => result);
      await untilSomeQueryWaitsForLock();
      commit();
      await first;

      const response = await second;
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'LAST_ORG_ADMIN' });
      expect(
        await prisma.membership.count({
          where: { organizationId: admin.organizationId, role: 'ORG_ADMIN' },
        }),
      ).toBe(1);
    });

    it('treats a member of another organization as unknown', async () => {
      const foreign = await loginOrgMember(app, prisma, 'ORG_ADMIN');

      await setRoles(foreign.userId, ['INSPECTOR']).expect(404);
      await remove(foreign.userId).expect(404);
      await remove('not-a-uuid').expect(400);
      expect(await prisma.membership.count({ where: { userId: foreign.userId } })).toBe(1);
    });

    it('is for the admins of the organization', async () => {
      const own = { ...admin, userId: inspector.id, accessToken: inspector.accessToken };
      await request(server()).get(orgPath('members', own)).set(bearer(own.accessToken)).expect(403);
      await setRoles(inspector.id, ['ORG_ADMIN'], own).expect(403);
    });
  });

  const NO_ID = '00000000-0000-4000-8000-000000000000';
  const routes: [string, (orgId: string, token: string) => request.Test][] = [
    [
      'GET members',
      (orgId, token) => request(server()).get(`/api/v1/orgs/${orgId}/members`).set(bearer(token)),
    ],
    [
      'PATCH a member',
      (orgId, token) =>
        request(server())
          .patch(`/api/v1/orgs/${orgId}/members/${NO_ID}`)
          .set(bearer(token))
          .send({ roles: ['INSPECTOR'] }),
    ],
    [
      'DELETE a member',
      (orgId, token) =>
        request(server()).delete(`/api/v1/orgs/${orgId}/members/${NO_ID}`).set(bearer(token)),
    ],
    [
      'GET invitations',
      (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/invitations`).set(bearer(token)),
    ],
    [
      'POST an invitation',
      (orgId, token) =>
        request(server())
          .post(`/api/v1/orgs/${orgId}/invitations`)
          .set(bearer(token))
          .send({ email: 'a@example.com', role: 'INSPECTOR' }),
    ],
    [
      'DELETE an invitation',
      (orgId, token) =>
        request(server()).delete(`/api/v1/orgs/${orgId}/invitations/${NO_ID}`).set(bearer(token)),
    ],
  ];

  it.each(routes)('%s: an admin of another organization gets 403', async (_name, send) => {
    await expectForeignOrgAdminForbidden(app, prisma, send);
  });

  it('closes the routes to a blocked organization', async () => {
    const blocked = await loginOrgMember(app, prisma, 'ORG_ADMIN', 'BLOCKED');

    const response = await invite({ email: 'a@example.com', role: 'INSPECTOR' }, blocked).expect(
      403,
    );

    expect(response.body).toMatchObject({ code: 'ORG_NOT_ACTIVE' });
  });
});
