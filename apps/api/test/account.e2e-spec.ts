import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login, PASSWORD } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createCatch,
  createExternalPermit,
  createOrganization,
  createPermit,
  createPermitType,
  createSpecies,
  createUser,
  createWater,
} from './factories';
import { lockUserTokens } from '../src/modules/auth/refresh-token.service';
import { untilSomeQueryWaitsForLock } from './lock-helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const UPLOADS_DIR = process.env.UPLOADS_DIR!;
const EMAIL = 'jan@example.test';

interface ErrorBody {
  code: string;
  details?: Record<string, unknown>;
}

/** The parts of the export file the tests look at. */
interface ExportFile {
  format: string;
  version: number;
  exportedAt: string;
  profile: Record<string, unknown>;
  organizations: { id: string; roles: string[] }[];
  invitations: { organization: { id: string }; role: string; acceptedAt: string | null }[];
  permits: Record<string, unknown>[];
  externalPermits: Record<string, unknown>[];
  catches: Record<string, unknown>[];
  inspections: Record<string, unknown>[];
  inspectionsPerformed: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  auditLog: Record<string, unknown>[];
}

/** The body as UTF-8 text: the file is checked byte for byte, not as parsed JSON. */
const textParser = (res: request.Response, done: (error: Error | null, body: string) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
};

describe('account: RODO export and deletion (T-26)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let userId: string;
  let accessToken: string;
  let cookie: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const exportData = (token = accessToken) =>
    request(server()).get('/api/v1/me/export').set(bearer(token)).buffer(true).parse(textParser);
  const deleteAccount = (password = PASSWORD, token = accessToken) =>
    request(server()).delete('/api/v1/me').set(bearer(token)).send({ password });
  const photoFiles = () =>
    readdir(join(UPLOADS_DIR, 'external-permits')).catch(() => [] as string[]);

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    const user = await createVerifiedUser(prisma, { email: EMAIL, anglerCardNo: 'KW-123' });
    userId = user.id;
    ({ accessToken, cookie } = await login(app, EMAIL));
    // UPLOADS_DIR is one per test file: each test counts only its own photos.
    await rm(join(UPLOADS_DIR, 'external-permits'), { recursive: true, force: true });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  /** A member of a new organization with these roles; returns the organization. */
  const joinOrganization = async (
    roles: ('ORG_ADMIN' | 'INSPECTOR')[],
    status: 'ACTIVE' | 'PENDING' | 'BLOCKED' = 'ACTIVE',
    member = userId,
  ) => {
    const organization = await createOrganization(prisma, { status });
    await prisma.membership.createMany({
      data: roles.map((role) => ({ userId: member, organizationId: organization.id, role })),
    });
    return organization;
  };

  /** Data of the user in every module, and one row of someone else's beside each. */
  const seedData = async () => {
    const organization = await joinOrganization(['INSPECTOR']);
    const water = await createWater(prisma, {
      name: 'Zalew Zegrzyński',
      status: 'CONNECTED',
      organizationId: organization.id,
    });
    const type = await createPermitType(prisma, {
      organizationId: organization.id,
      waters: { connect: [{ id: water.id }] },
    });
    const permit = await createPermit(prisma, {
      userId,
      permitTypeId: type.id,
      status: 'PAID',
      number: 'ZW-2026-000001',
    });
    await prisma.payment.create({
      data: {
        permitId: permit.id,
        provider: 'FAKE',
        sessionId: randomUUID(),
        amountGrosze: 2500,
        status: 'SUCCEEDED',
        rawNotification: { secret: 'provider data' },
      },
    });
    const external = await createExternalPermit(prisma, { userId, number: 'PZW/123/2026' });
    const { id: speciesId } = await createSpecies(prisma);
    const onPermit = await createCatch(prisma, {
      userId,
      permitId: permit.id,
      fishingWaterId: water.id,
      speciesId,
      lat: 52.4875,
      lng: 21.0102,
    });
    const onExternal = await createCatch(prisma, {
      userId,
      externalPermitId: external.id,
      fishingWaterId: water.id,
      speciesId,
      lat: 52.1,
      lng: 21.1,
    });
    const inspector = await createUser(prisma, { firstName: 'Anna', lastName: 'Nowak' });
    await prisma.inspection.create({
      data: {
        inspectorId: inspector.id,
        permitId: permit.id,
        organizationId: organization.id,
        result: 'OK',
        notes: 'Bez uwag',
        lat: 52.48,
        lng: 21.01,
      },
    });
    // Someone else's data next to the user's.
    const other = await createUser(prisma);
    const otherPermit = await createPermit(prisma, { userId: other.id, permitTypeId: type.id });
    await createCatch(prisma, {
      userId: other.id,
      permitId: otherPermit.id,
      fishingWaterId: water.id,
      speciesId,
      lat: 50,
      lng: 20,
    });
    return { organization, water, permit, external, onPermit, onExternal, other };
  };

  describe('GET /me/export', () => {
    it('is a JSON attachment of everything about the user that no cache keeps', async () => {
      const { organization, permit, external, onPermit, onExternal } = await seedData();
      // The user is also an inspector of the organization: their protocols are their data too.
      const holder = await createUser(prisma, { firstName: 'Ewa', lastName: 'Zielińska' });
      const inspected = await createPermit(prisma, {
        userId: holder.id,
        permitTypeId: permit.permitTypeId,
        number: 'ZW-2026-000002',
      });
      await prisma.inspection.create({
        data: {
          inspectorId: userId,
          permitId: inspected.id,
          organizationId: organization.id,
          result: 'VIOLATION',
          notes: 'Brak karty wędkarskiej',
          lat: 52.5,
          lng: 21.2,
        },
      });
      const inviting = await createOrganization(prisma, { status: 'ACTIVE' });
      await prisma.invitation.create({
        data: {
          organizationId: inviting.id,
          email: EMAIL,
          role: 'ORG_ADMIN',
          tokenHash: 'invitation-hash',
          expiresAt: new Date('2026-10-10T00:00:00.000Z'),
        },
      });
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'INVITATION_ACCEPTED',
          entity: 'Invitation',
          entityId: randomUUID(),
          diff: { organizationId: organization.id, role: 'INSPECTOR' },
        },
      });

      const response = await exportData().expect(200);

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="lowisko-dane-2026-10-06.json"',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      const file = JSON.parse(response.body as string) as ExportFile;
      expect(file).toMatchObject({
        format: 'lowisko-account-export',
        version: 1,
        exportedAt: FIXED_NOW.toISOString(),
        profile: {
          id: userId,
          email: EMAIL,
          firstName: 'Jan',
          lastName: 'Kowalski',
          birthDate: '1990-05-01',
          anglerCardNo: 'KW-123',
          locale: 'pl',
          emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        },
        organizations: [{ id: organization.id, roles: ['INSPECTOR'] }],
        invitations: [{ organization: { id: inviting.id }, role: 'ORG_ADMIN', acceptedAt: null }],
        permits: [
          {
            id: permit.id,
            number: 'ZW-2026-000001',
            organization: { id: organization.id },
            payments: [{ provider: 'FAKE', amountGrosze: 2500, status: 'SUCCEEDED' }],
          },
        ],
        externalPermits: [{ id: external.id, number: 'PZW/123/2026', photoType: null }],
        inspections: [
          {
            permit: { id: permit.id, number: 'ZW-2026-000001' },
            organization: { id: organization.id, name: organization.name },
            result: 'OK',
            notes: 'Bez uwag',
          },
        ],
        inspectionsPerformed: [
          {
            permit: { id: inspected.id, number: 'ZW-2026-000002' },
            organization: { id: organization.id, name: organization.name },
            result: 'VIOLATION',
            notes: 'Brak karty wędkarskiej',
            lat: 52.5,
            lng: 21.2,
          },
        ],
        sessions: [{ revokedAt: null }],
        auditLog: [{ action: 'INVITATION_ACCEPTED', entity: 'Invitation' }],
      });
      expect(file.catches.map((row) => [row.id, row.lat])).toEqual([
        [onPermit.id, 52.4875],
        [onExternal.id, 52.1],
      ]);
      // No secrets and nobody else's personal data.
      const text = response.body as string;
      for (const absent of [
        'passwordHash',
        'tokenHash',
        'qrToken',
        'rawNotification',
        'sessionId',
        'invitation-hash',
        'Anna',
        'Nowak',
        'Ewa',
        'Zielińska',
        '"diff"',
      ]) {
        expect(text).not.toContain(absent);
      }
    });

    it('holds only the data of the token owner', async () => {
      await seedData();
      const stranger = await createVerifiedUser(prisma);
      const { accessToken: strangerToken } = await login(app, stranger.email);

      const file = JSON.parse(
        (await exportData(strangerToken).expect(200)).body as string,
      ) as ExportFile;

      expect(file).toMatchObject({
        profile: { id: stranger.id },
        organizations: [],
        invitations: [],
        permits: [],
        externalPermits: [],
        catches: [],
        inspections: [],
        inspectionsPerformed: [],
      });
    });

    it('requires authentication', async () => {
      await request(server()).get('/api/v1/me/export').expect(401);
    });
  });

  describe('DELETE /me', () => {
    it('refuses a wrong password and changes nothing', async () => {
      const response = await deleteAccount('wrong password').expect(401);

      expect((response.body as ErrorBody).code).toBe('INVALID_CREDENTIALS');
      expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
        email: EMAIL,
        deletedAt: null,
      });
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('requires the password', async () => {
      const response = await request(server())
        .delete('/api/v1/me')
        .set(bearer(accessToken))
        .send({})
        .expect(400);

      expect((response.body as ErrorBody).code).toBe('VALIDATION_FAILED');
    });

    it('anonymises the profile, ends every session and clears the refresh cookie', async () => {
      await prisma.oneTimeToken.create({
        data: {
          userId,
          purpose: 'PASSWORD_RESET',
          tokenHash: 'reset-hash',
          expiresAt: new Date('2026-10-07T00:00:00.000Z'),
        },
      });

      const response = await deleteAccount().expect(204);

      expect(response.headers['set-cookie']).toEqual([
        expect.stringMatching(/^rt=; Path=\/api\/v1\/auth; Expires=Thu, 01 Jan 1970/) as unknown,
      ]);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
        email: `deleted-${userId}@anonymized.invalid`,
        emailVerifiedAt: null,
        passwordHash: '!',
        firstName: '',
        lastName: '',
        birthDate: new Date('1900-01-01T00:00:00.000Z'),
        anglerCardNo: null,
        isSuperAdmin: false,
        deletedAt: FIXED_NOW,
      });
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
      expect(await prisma.oneTimeToken.count({ where: { userId } })).toBe(0);
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: userId,
          action: 'ACCOUNT_DELETED',
          entity: 'User',
          entityId: userId,
          diff: {
            organizations: [],
            cancelledInvitations: 0,
            catchesWithPosition: 0,
            externalPermitPhotos: 0,
          },
        }),
      ]);
    });

    it('stops the access token at once and frees the address', async () => {
      await deleteAccount().expect(204);

      const me = await request(server()).get('/api/v1/me').set(bearer(accessToken)).expect(401);
      expect((me.body as ErrorBody).code).toBe('UNAUTHENTICATED');
      // An offline queue synced right after the deletion must not reach the anonymised account.
      await request(server())
        .post('/api/v1/catches/sync')
        .set(bearer(accessToken))
        .send({ items: [] })
        .expect(401);
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(401);
      await request(server())
        .post('/api/v1/auth/register')
        .send({
          email: EMAIL,
          password: PASSWORD,
          firstName: 'Jan',
          lastName: 'Nowy',
          birthDate: '1991-01-01',
          acceptTerms: true,
        })
        .expect(204);
    });

    it('keeps catches without positions, permits with the masked owner, external permits without number and photo', async () => {
      const { permit, external, onPermit, onExternal, other } = await seedData();
      await request(server())
        .put(`/api/v1/me/external-permits/${external.id}/photo`)
        .set(bearer(accessToken))
        .attach('file', PNG, { filename: 'zezwolenie.png', contentType: 'image/png' })
        .expect(200);
      expect(await photoFiles()).toHaveLength(1);

      await deleteAccount().expect(204);

      const catches = await prisma.catchRecord.findMany({
        where: { id: { in: [onPermit.id, onExternal.id] } },
      });
      expect(catches).toHaveLength(2);
      for (const row of catches) {
        expect(row).toMatchObject({ userId, lat: null, lng: null, lengthCm: 30, kept: true });
      }
      expect(await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } })).toMatchObject({
        userId,
        number: 'ZW-2026-000001',
        status: 'PAID',
      });
      expect(
        await prisma.externalPermit.findUniqueOrThrow({ where: { id: external.id } }),
      ).toMatchObject({ userId, number: null, photoKey: null, issuerName: 'Okręg PZW Warszawa' });
      expect(await photoFiles()).toEqual([]);
      // Someone else's catch keeps its position.
      expect(
        await prisma.catchRecord.findFirstOrThrow({ where: { userId: other.id } }),
      ).toMatchObject({ lat: 50, lng: 20 });
      expect(
        (await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_DELETED' } })).diff,
      ).toMatchObject({ catchesWithPosition: 2, externalPermitPhotos: 1 });
    });

    it('takes the memberships and the invitations, and the address out of the invitation history', async () => {
      const inspected = await joinOrganization(['INSPECTOR']);
      const admined = await joinOrganization(['ORG_ADMIN', 'INSPECTOR']);
      const colleague = await createUser(prisma);
      await prisma.membership.create({
        data: { userId: colleague.id, organizationId: admined.id, role: 'ORG_ADMIN' },
      });
      const invitation = (organizationId: string, email: string, acceptedAt?: Date) =>
        prisma.invitation.create({
          data: {
            organizationId,
            email,
            role: 'INSPECTOR',
            tokenHash: randomUUID(),
            expiresAt: new Date('2026-10-10T00:00:00.000Z'),
            acceptedAt,
          },
        });
      const pending = await invitation(inspected.id, EMAIL);
      const accepted = await invitation(admined.id, EMAIL, new Date('2026-09-01T00:00:00.000Z'));
      const othersPending = await invitation(inspected.id, 'ola@example.test');
      const entry = (action: string, email: string) =>
        prisma.auditLog.create({
          data: {
            actorId: colleague.id,
            action,
            entity: 'Invitation',
            entityId: randomUUID(),
            diff: { organizationId: inspected.id, email, role: 'INSPECTOR', replaced: 0 },
          },
        });
      const created = await entry('INVITATION_CREATED', EMAIL);
      const cancelled = await entry('INVITATION_CANCELLED', EMAIL);
      const othersEntry = await entry('INVITATION_CREATED', 'ola@example.test');

      await deleteAccount().expect(204);

      expect(await prisma.membership.count({ where: { userId } })).toBe(0);
      expect(await prisma.invitation.findUnique({ where: { id: pending.id } })).toBeNull();
      expect(
        await prisma.invitation.findUniqueOrThrow({ where: { id: accepted.id } }),
      ).toMatchObject({ email: `deleted-${userId}@anonymized.invalid` });
      expect(
        await prisma.invitation.findUniqueOrThrow({ where: { id: othersPending.id } }),
      ).toMatchObject({ email: 'ola@example.test' });
      const diffOf = async (id: string) =>
        (await prisma.auditLog.findUniqueOrThrow({ where: { id } })).diff;
      expect(await diffOf(created.id)).toEqual({
        organizationId: inspected.id,
        email: null,
        role: 'INSPECTOR',
        replaced: 0,
      });
      expect(await diffOf(cancelled.id)).toMatchObject({ email: null });
      expect(await diffOf(othersEntry.id)).toMatchObject({ email: 'ola@example.test' });
      const removed = await prisma.auditLog.findMany({
        where: { action: 'MEMBER_REMOVED' },
        select: { actorId: true, entityId: true, diff: true },
      });
      expect(removed).toHaveLength(2);
      expect(removed).toEqual(
        expect.arrayContaining([
          {
            actorId: userId,
            entityId: inspected.id,
            diff: { userId, roles: ['INSPECTOR'], accountDeleted: true },
          },
          {
            actorId: userId,
            entityId: admined.id,
            diff: { userId, roles: ['ORG_ADMIN', 'INSPECTOR'], accountDeleted: true },
          },
        ]),
      );
      expect(
        (await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_DELETED' } })).diff,
      ).toMatchObject({ cancelledInvitations: 1 });
    });

    it('refuses the last admin of an ACTIVE organization and changes nothing', async () => {
      const organization = await joinOrganization(['ORG_ADMIN']);
      const inspector = await createUser(prisma);
      await prisma.membership.create({
        data: { userId: inspector.id, organizationId: organization.id, role: 'INSPECTOR' },
      });

      const response = await deleteAccount().expect(409);

      expect(response.body).toMatchObject({
        code: 'LAST_ORG_ADMIN',
        details: { organizationIds: [organization.id] },
      });
      expect(await prisma.membership.count({ where: { userId } })).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it.each(['PENDING', 'BLOCKED'] as const)(
      'lets the last admin of a %s organization go: it cannot invite anyone',
      async (status) => {
        const organization = await joinOrganization(['ORG_ADMIN'], status);

        await deleteAccount().expect(204);

        expect(await prisma.membership.count({ where: { organizationId: organization.id } })).toBe(
          0,
        );
      },
    );

    it('lets only one of the two last admins of an organization delete their account at once', async () => {
      const organization = await joinOrganization(['ORG_ADMIN']);
      const second = await createVerifiedUser(prisma);
      await prisma.membership.create({
        data: { userId: second.id, organizationId: organization.id, role: 'ORG_ADMIN' },
      });
      const { accessToken: secondToken } = await login(app, second.email);
      // Holds the organization row: both deletions queue up behind it.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Organization" WHERE "id" = ${organization.id}::uuid FOR NO KEY UPDATE`;
        await held;
      });
      const first = deleteAccount().then((response) => response);
      const other = deleteAccount(PASSWORD, secondToken).then((response) => response);
      await untilSomeQueryWaitsForLock(prisma, 2);
      release();
      await holder;

      const statuses = [(await first).status, (await other).status].sort();
      expect(statuses).toEqual([204, 409]);
      expect(
        await prisma.membership.count({
          where: { organizationId: organization.id, role: 'ORG_ADMIN' },
        }),
      ).toBe(1);
    });

    it('limits password attempts per account, not per address, and not the login', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await deleteAccount('wrong password').expect(401);
      }

      const response = await deleteAccount().expect(429);

      expect((response.body as ErrorBody).code).toBe('RATE_LIMITED');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
      // From the same address: another account may still confirm, and logging in still works.
      const other = await createVerifiedUser(prisma);
      const { accessToken: otherToken } = await login(app, other.email);
      await deleteAccount('wrong password', otherToken).expect(401);
      await login(app, EMAIL);
    });

    it('does not deadlock with an admin removing the member at the same time', async () => {
      const organization = await joinOrganization(['INSPECTOR']);
      await prisma.invitation.create({
        data: {
          organizationId: organization.id,
          email: EMAIL,
          role: 'ORG_ADMIN',
          tokenHash: randomUUID(),
          expiresAt: new Date('2026-10-10T00:00:00.000Z'),
        },
      });
      // As MembersService.remove: the organization first, then the member's invitations.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const removal = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Organization" WHERE "id" = ${organization.id}::uuid FOR NO KEY UPDATE`;
        await held;
        await tx.membership.deleteMany({ where: { organizationId: organization.id, userId } });
        await tx.invitation.deleteMany({
          where: { organizationId: organization.id, email: EMAIL, acceptedAt: null },
        });
      });
      const deletion = deleteAccount().then((response) => response);
      await untilSomeQueryWaitsForLock(prisma);
      release();

      await removal;
      expect((await deletion).status).toBe(204);
      expect(await prisma.invitation.count()).toBe(0);
    });

    it('does not deadlock with a password reset at the same time', async () => {
      const link = await prisma.oneTimeToken.create({
        data: {
          userId,
          purpose: 'PASSWORD_RESET',
          tokenHash: 'reset-hash',
          expiresAt: new Date('2026-10-07T00:00:00.000Z'),
        },
      });
      // As AuthService.resetPassword: the link, the user row, then the refresh tokens.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const reset = prisma.$transaction(async (tx) => {
        await tx.oneTimeToken.update({ where: { id: link.id }, data: { usedAt: FIXED_NOW } });
        await held;
        await tx.user.update({ where: { id: userId }, data: { passwordHash: 'changed' } });
        await lockUserTokens(tx, userId);
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: FIXED_NOW },
        });
      });
      const deletion = deleteAccount().then((response) => response);
      await untilSomeQueryWaitsForLock(prisma);
      release();

      await reset;
      expect((await deletion).status).toBe(204);
      expect(await prisma.oneTimeToken.count()).toBe(0);
    });

    it('removes the membership of an invitation accepted while the account is deleted', async () => {
      const organization = await createOrganization(prisma, { status: 'ACTIVE' });
      const invitation = await prisma.invitation.create({
        data: {
          organizationId: organization.id,
          email: EMAIL,
          role: 'INSPECTOR',
          tokenHash: randomUUID(),
          expiresAt: new Date('2026-10-10T00:00:00.000Z'),
        },
      });
      // As InvitationsService.accept: the invitation row, then the membership.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const acceptance = prisma.$transaction(async (tx) => {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: FIXED_NOW },
        });
        await tx.membership.create({
          data: { organizationId: organization.id, userId, role: 'INSPECTOR' },
        });
        await held;
      });
      const deletion = deleteAccount().then((response) => response);
      await untilSomeQueryWaitsForLock(prisma);
      release();

      await acceptance;
      expect((await deletion).status).toBe(204);
      expect(await prisma.membership.count({ where: { userId } })).toBe(0);
      expect(
        (await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).email,
      ).toBe(`deleted-${userId}@anonymized.invalid`);
    });

    it('answers 401 to a second deletion with the same token', async () => {
      await deleteAccount().expect(204);

      await deleteAccount().expect(401);
    });
  });

  describe('a write that passed the guard while the account is being deleted', () => {
    /**
     * A deletion in progress holds the user row (`lockForDeletion`) and anonymises it: the
     * request, authenticated just before, waits for it and must then find the account gone.
     */
    const duringDeletion = async (send: () => request.Test) => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const deletion = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
        await tx.user.update({ where: { id: userId }, data: { deletedAt: FIXED_NOW } });
        await held;
      });
      const response = send().then((sent) => sent);
      await untilSomeQueryWaitsForLock(prisma);
      release();
      await deletion;
      return response;
    };
    const expectDeleted = (response: request.Response) => {
      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).code).toBe('UNAUTHENTICATED');
    };

    it('records no catch with its position', async () => {
      const water = await createWater(prisma);
      const { id: speciesId } = await createSpecies(prisma);
      const external = await createExternalPermit(prisma, {
        userId,
        waters: { connect: [{ id: water.id }] },
      });

      const response = await duringDeletion(() =>
        request(server())
          .post('/api/v1/catches/sync')
          .set(bearer(accessToken))
          .send({
            items: [
              {
                clientId: randomUUID(),
                permitId: null,
                externalPermitId: external.id,
                fishingWaterId: water.id,
                speciesId,
                caughtAt: '2026-10-06T08:00:00.000Z',
                lengthCm: 30,
                weightG: null,
                kept: false,
                lat: 52.43,
                lng: 21.03,
              },
            ],
          }),
      );

      expectDeleted(response);
      expect(await prisma.catchRecord.count()).toBe(0);
    });

    it('creates no external permit', async () => {
      const water = await createWater(prisma);

      const response = await duringDeletion(() =>
        request(server())
          .post('/api/v1/me/external-permits')
          .set(bearer(accessToken))
          .send({
            issuerName: 'Okręg PZW Warszawa',
            number: 'PZW/1/2026',
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
            waterIds: [water.id],
          }),
      );

      expectDeleted(response);
      expect(await prisma.externalPermit.count()).toBe(0);
    });

    it('stores no photo of an external permit', async () => {
      const external = await createExternalPermit(prisma, { userId });

      const response = await duringDeletion(() =>
        request(server())
          .put(`/api/v1/me/external-permits/${external.id}/photo`)
          .set(bearer(accessToken))
          .attach('file', PNG, { filename: 'zezwolenie.png', contentType: 'image/png' }),
      );

      expectDeleted(response);
      expect(
        (await prisma.externalPermit.findUniqueOrThrow({ where: { id: external.id } })).photoKey,
      ).toBeNull();
      expect(await photoFiles()).toEqual([]);
    });

    it('writes no name over the placeholders', async () => {
      const response = await duringDeletion(() =>
        request(server()).patch('/api/v1/me').set(bearer(accessToken)).send({ firstName: 'Janek' }),
      );

      expectDeleted(response);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).firstName).toBe(
        'Jan',
      );
    });
  });
});
