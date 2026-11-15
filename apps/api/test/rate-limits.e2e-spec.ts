import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Test } from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization } from './factories';
import { loginOrgMember } from './org-helpers';

/**
 * Limits of the account writes (T-28, docs/05-api.md → «Лимиты записей аккаунта»).
 * Requests are invalid on purpose: every attempt counts (the guard runs before validation and
 * before the file is read), so the limits are reached without writing rows or files.
 */
describe('rate limits of account writes (T-28)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;

  const api = (method: 'post' | 'put', path: string, accessToken: string): Test =>
    request(app.getHttpServer())
      [method](`/api/v1/${path}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

  const loginAngler = async (): Promise<string> =>
    (await login(app, (await createVerifiedUser(prisma)).email)).accessToken;

  /** Sends `limit` requests that are not throttled, then expects 429 RATE_LIMITED. */
  async function expectLimit(limit: number, send: () => Test): Promise<void> {
    for (let i = 0; i < limit; i += 1) {
      const response = await send();
      if (response.status === 429) {
        throw new Error(`Throttled after ${i} requests, expected ${limit}`);
      }
    }
    const blocked = await send().expect(429);
    expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
    // Named throttlers say when to retry in `Retry-After-<name>`.
    expect(Object.keys(blocked.headers).some((name) => name.startsWith('retry-after-'))).toBe(true);
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('allows 10 water suggestions a day per account, then answers RATE_LIMITED', async () => {
    const angler = await loginAngler();

    await expectLimit(10, () => api('post', 'waters/suggestions', angler));
    // Another account has its own counter.
    await api('post', 'waters/suggestions', await loginAngler()).expect(400);
  });

  it('allows 20 new external permits a day per account', async () => {
    const angler = await loginAngler();

    await expectLimit(20, () => api('post', 'me/external-permits', angler));
    await api('post', 'me/external-permits', await loginAngler()).expect(400);
  });

  it('counts the uploads of an account on all upload routes together, 30 an hour', async () => {
    const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    const uploads = [
      () => api('put', `me/external-permits/${randomUUID()}/photo`, admin.accessToken),
      () => api('put', `catches/${randomUUID()}/photo`, admin.accessToken),
      () =>
        api('put', `orgs/${admin.organizationId}/waters/${randomUUID()}/photo`, admin.accessToken),
      () => api('post', `orgs/${admin.organizationId}/claims`, admin.accessToken),
    ];
    let sent = 0;

    await expectLimit(30, () => uploads[sent++ % uploads.length]!());
    for (const upload of uploads) {
      await upload().expect(429);
    }
    // Uploads of another account are not affected.
    await api('put', `catches/${randomUUID()}/photo`, await loginAngler()).expect(400);
  });

  it('allows one admin 20 invitations an hour, across organizations', async () => {
    const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    const second = await createOrganization(prisma, { status: 'ACTIVE' });
    await prisma.membership.create({
      data: { userId: admin.userId, organizationId: second.id, role: 'ORG_ADMIN' },
    });
    let sent = 0;

    await expectLimit(20, () =>
      api(
        'post',
        `orgs/${sent++ % 2 === 0 ? admin.organizationId : second.id}/invitations`,
        admin.accessToken,
      ),
    );
  });

  it('allows one organization 50 invitations a day, whoever of its admins sends them', async () => {
    const organization = await createOrganization(prisma, { status: 'ACTIVE' });
    const admins: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const user = await createVerifiedUser(prisma);
      await prisma.membership.create({
        data: { userId: user.id, organizationId: organization.id, role: 'ORG_ADMIN' },
      });
      admins.push((await login(app, user.email)).accessToken);
    }
    const invite = (token: string) => api('post', `orgs/${organization.id}/invitations`, token);
    let sent = 0;

    // 17 + 17 + 16: every admin stays under the personal limit of 20.
    await expectLimit(50, () => invite(admins[sent++ % 3]!));
    await invite(admins[0]!).expect(429);
    // Another organization of the same size is not affected.
    const other = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    await api('post', `orgs/${other.organizationId}/invitations`, other.accessToken).expect(400);
  });

  it('does not let the admin of another organization use up its invitation quota', async () => {
    const victim = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    const attackers = await Promise.all(
      Array.from({ length: 3 }, () => loginOrgMember(app, prisma, 'ORG_ADMIN')),
    );

    for (const attacker of attackers) {
      for (let i = 0; i < 20; i += 1) {
        await api('post', `orgs/${victim.organizationId}/invitations`, attacker.accessToken).expect(
          403,
        );
      }
    }
    await api('post', `orgs/${victim.organizationId}/invitations`, victim.accessToken).expect(400);
  });
});
