import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login, PASSWORD, refreshCookie } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createUser } from './factories';
import { FakeMailTransport } from './mail/fake-mail-transport';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const registration = {
  email: 'Jan.Kowalski@Example.test',
  password: PASSWORD,
  firstName: 'Jan',
  lastName: 'Kowalski',
  birthDate: '1990-05-01',
  acceptTerms: true,
};

describe('auth', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let mail: FakeMailTransport;
  let now: Date;

  const http = () => request(app.getHttpServer());
  const at = (offsetMs: number) => {
    now = new Date(FIXED_NOW.getTime() + offsetMs);
  };
  const me = (accessToken: string) =>
    http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
  const refresh = (cookie?: string) => {
    const req = http().post('/api/v1/auth/refresh');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    mail = new FakeMailTransport();
    now = FIXED_NOW;
    app = await createTestApp({ prisma, mail, now: () => now });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /auth/register', () => {
    it('creates an unverified account with an argon2id hash and emails a confirmation link', async () => {
      await http().post('/api/v1/auth/register').send(registration).expect(204);

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'jan.kowalski@example.test' },
      });
      expect(user).toMatchObject({ emailVerifiedAt: null, locale: 'pl', anglerCardNo: null });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.birthDate.toISOString()).toBe('1990-05-01T00:00:00.000Z');

      const [message] = mail.to('jan.kowalski@example.test');
      expect(message).toMatchObject({
        from: 'Łowisko <no-reply@lowisko.test>',
        subject: 'Potwierdź adres e-mail — Łowisko',
      });
      expect(message?.text).toContain('http://localhost:5173/verify-email?token=');
    });

    it('writes the email in the language chosen at registration', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ ...registration, locale: 'en' })
        .expect(204);

      expect(mail.sent[0]?.subject).toBe('Confirm your email — Łowisko');
    });

    it('stores only the SHA-256 of the confirmation token', async () => {
      await http().post('/api/v1/auth/register').send(registration).expect(204);
      const token = mail.tokenFor('jan.kowalski@example.test');

      const stored = await prisma.oneTimeToken.findFirstOrThrow();
      expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.tokenHash).not.toContain(token);
      expect(stored.expiresAt).toEqual(new Date(FIXED_NOW.getTime() + DAY));
    });

    it('rejects an email that is already registered, ignoring case', async () => {
      await createUser(prisma, { email: 'jan.kowalski@example.test' });

      const response = await http().post('/api/v1/auth/register').send(registration).expect(409);

      expect(response.body).toMatchObject({ code: 'EMAIL_TAKEN' });
      expect(mail.sent).toEqual([]);
    });

    it.each([
      ['without the privacy policy consent', { acceptTerms: false }, 'acceptTerms'],
      ['with a 7-character password', { password: 'x'.repeat(7) }, 'password'],
      ['with an invalid email', { email: 'jan@' }, 'email'],
      ['with an impossible birth date', { birthDate: '1990-02-30' }, 'birthDate'],
      ['with a birth date in the future', { birthDate: '2026-10-07' }, 'birthDate'],
      ['trying to become a superadmin', { isSuperAdmin: true }, 'isSuperAdmin'],
    ])('rejects a registration %s', async (_case, change, field) => {
      const response = await http()
        .post('/api/v1/auth/register')
        .send({ ...registration, ...change })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(
        Object.keys((response.body as { details: { fields: object } }).details.fields),
      ).toContain(field);
      expect(await prisma.user.count()).toBe(0);
    });

    it('keeps the account when the mail server is down', async () => {
      mail.failNext = true;

      await http().post('/api/v1/auth/register').send(registration).expect(204);

      expect(await prisma.user.count()).toBe(1);
    });
  });

  describe('POST /auth/verify-email', () => {
    const registerAndGetToken = async (): Promise<string> => {
      await http().post('/api/v1/auth/register').send(registration).expect(204);
      return mail.tokenFor('jan.kowalski@example.test');
    };

    it('confirms the email so that the user can log in', async () => {
      const token = await registerAndGetToken();

      await http().post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const user = await prisma.user.findFirstOrThrow();
      expect(user.emailVerifiedAt).toEqual(FIXED_NOW);
      await login(app, 'jan.kowalski@example.test');
    });

    it('accepts a link only once', async () => {
      const token = await registerAndGetToken();
      await http().post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const response = await http().post('/api/v1/auth/verify-email').send({ token }).expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_TOKEN' });
    });

    it('rejects a link older than 24 hours with TOKEN_EXPIRED', async () => {
      const token = await registerAndGetToken();

      at(DAY - 1);
      await http().post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const second = await registerAndGetTokenFor('anna@example.test');
      at(2 * DAY);
      const response = await http()
        .post('/api/v1/auth/verify-email')
        .send({ token: second })
        .expect(401);
      expect(response.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
    });

    it('rejects an unknown token and a password reset token', async () => {
      const user = await createUser(prisma);
      await http().post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(204);
      await mail.waitFor(user.email);

      for (const token of ['made-up-token', mail.tokenFor(user.email)]) {
        const response = await http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
        expect(response.body).toMatchObject({ code: 'INVALID_TOKEN' });
      }
    });

    async function registerAndGetTokenFor(email: string): Promise<string> {
      await http()
        .post('/api/v1/auth/register')
        .send({ ...registration, email })
        .expect(204);
      return mail.tokenFor(email);
    }
  });

  describe('POST /auth/login', () => {
    it('returns an access token and sets the refresh cookie for the auth routes only', async () => {
      const user = await createVerifiedUser(prisma, { email: 'jan@example.test' });

      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: ' JAN@example.test ', password: PASSWORD })
        .expect(200);

      const { accessToken } = response.body as { accessToken: string };
      await me(accessToken).expect(200);
      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^rt=[\w-]{43};/);
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
    });

    it.each([
      ['a wrong password', 'jan@example.test', 'wrong password'],
      ['an unknown email', 'nobody@example.test', PASSWORD],
    ])('answers %s with INVALID_CREDENTIALS', async (_case, email, password) => {
      await createVerifiedUser(prisma, { email: 'jan@example.test' });

      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);

      expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(refreshCookie(response)).toBeUndefined();
    });

    it('refuses an unconfirmed email only after a correct password', async () => {
      await createVerifiedUser(prisma, { email: 'jan@example.test', emailVerifiedAt: null });

      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'jan@example.test', password: 'wrong password' })
        .expect(401);
      const right = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'jan@example.test', password: PASSWORD })
        .expect(401);

      expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(right.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    });

    it('refuses an anonymised account', async () => {
      await createVerifiedUser(prisma, { email: 'jan@example.test', deletedAt: FIXED_NOW });

      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'jan@example.test', password: PASSWORD })
        .expect(401);

      expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('allows 5 attempts per minute for one IP and email, then answers RATE_LIMITED', async () => {
      await createVerifiedUser(prisma, { email: 'jan@example.test' });
      const attempt = (email: string, password = 'wrong password') =>
        http().post('/api/v1/auth/login').send({ email, password });

      for (let i = 0; i < 5; i++) {
        await attempt('jan@example.test').expect(401);
      }
      const blocked = await attempt('jan@example.test', PASSWORD).expect(429);

      expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
      // Another account from the same IP is not locked out.
      await attempt('anna@example.test').expect(401);
    });
  });

  describe('access token', () => {
    it('accepts the Bearer scheme in any letter case', async () => {
      const user = await createVerifiedUser(prisma);
      const { accessToken } = await login(app, user.email);

      await http().get('/api/v1/me').set('Authorization', `bearer ${accessToken}`).expect(200);
    });

    it('is required on routes that are not public', async () => {
      const response = await http().get('/api/v1/me').expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('expires after 15 minutes with TOKEN_EXPIRED', async () => {
      const user = await createVerifiedUser(prisma);
      const { accessToken } = await login(app, user.email);

      at(15 * MINUTE - 1000);
      await me(accessToken).expect(200);
      at(15 * MINUTE + 1000);
      const response = await me(accessToken).expect(401);

      expect(response.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
    });

    it('is rejected when tampered with or signed with another key', async () => {
      const user = await createVerifiedUser(prisma);
      const { accessToken } = await login(app, user.email);
      const [header, , signature] = accessToken.split('.');
      const otherSub = Buffer.from(JSON.stringify({ sub: randomId(), exp: 4e9 })).toString(
        'base64url',
      );
      const foreign = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setAudience('lowisko-api')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('another-secret-that-is-32-bytes-long'));

      for (const token of [`${header}.${otherSub}.${signature}`, foreign]) {
        const response = await me(token).expect(401);
        expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      }
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and issues a working access token', async () => {
      const user = await createVerifiedUser(prisma);
      const session = await login(app, user.email);

      const response = await refresh(session.cookie).expect(200);

      const rotated = refreshCookie(response);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(session.cookie);
      await me((response.body as { accessToken: string }).accessToken).expect(200);
    });

    it('revokes the whole family when a rotated token is used again', async () => {
      const user = await createVerifiedUser(prisma);
      const stolen = await login(app, user.email);
      const otherDevice = await login(app, user.email);
      const rotated = refreshCookie(await refresh(stolen.cookie).expect(200));

      const reuse = await refresh(stolen.cookie).expect(401);

      expect(reuse.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      // The legitimate successor is revoked too, so the thief's copy is worthless...
      await refresh(rotated).expect(401);
      // ...while another login of the same user is a separate family.
      await refresh(otherDevice.cookie).expect(200);
    });

    it('treats two concurrent refreshes with one token as reuse and leaves no working token', async () => {
      const user = await createVerifiedUser(prisma);
      const { cookie } = await login(app, user.email);

      const responses = await Promise.all([refresh(cookie), refresh(cookie)]);

      // Whichever order the database picks, the second use of the token is a reuse: at most
      // one request gets a new token, and that token is revoked with the family.
      const statuses = responses.map((r) => r.status).sort();
      expect([
        [200, 401],
        [401, 401],
      ]).toContainEqual(statuses);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      for (const response of responses.filter((r) => r.status === 200)) {
        await refresh(refreshCookie(response)).expect(401);
      }
    });

    it('answers 401 and clears the cookie without a valid token', async () => {
      const missing = await refresh().expect(401);
      const unknown = await refresh('rt=made-up').expect(401);

      expect(missing.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(unknown.headers['set-cookie']).toEqual([
        expect.stringMatching(/^rt=; Path=\/api\/v1\/auth; Expires=Thu, 01 Jan 1970/),
      ]);
    });

    it('expires after 7 days without use, each rotation extending it', async () => {
      const user = await createVerifiedUser(prisma);
      const { cookie } = await login(app, user.email);

      at(7 * DAY - MINUTE);
      const rotated = refreshCookie(await refresh(cookie).expect(200));
      at(14 * DAY - 2 * MINUTE);
      const again = refreshCookie(await refresh(rotated).expect(200));
      at(21 * DAY);

      await refresh(again).expect(401);
    });

    it('stops working for an anonymised account', async () => {
      const user = await createVerifiedUser(prisma);
      const { cookie } = await login(app, user.email);
      await prisma.user.update({ where: { id: user.id }, data: { deletedAt: FIXED_NOW } });

      await refresh(cookie).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token family of this device and clears the cookie', async () => {
      const user = await createVerifiedUser(prisma);
      const thisDevice = await login(app, user.email);
      const otherDevice = await login(app, user.email);

      const response = await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${thisDevice.accessToken}`)
        .set('Cookie', thisDevice.cookie)
        .expect(204);

      expect(response.headers['set-cookie']).toEqual([expect.stringMatching(/^rt=;/)]);
      await refresh(thisDevice.cookie).expect(401);
      await refresh(otherDevice.cookie).expect(200);
    });

    it('needs an access token', async () => {
      await http().post('/api/v1/auth/logout').expect(401);
    });

    it("does not revoke another account's refresh token", async () => {
      const jan = await createVerifiedUser(prisma);
      const anna = await createVerifiedUser(prisma);
      const janSession = await login(app, jan.email);
      const annaSession = await login(app, anna.email);

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${janSession.accessToken}`)
        .set('Cookie', annaSession.cookie)
        .expect(204);

      await refresh(annaSession.cookie).expect(200);
    });
  });

  describe('password reset', () => {
    const forgot = (email: string) =>
      http().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
    const reset = (token: string, password = 'a brand new password') =>
      http().post('/api/v1/auth/reset-password').send({ token, password });

    it('answers the same for unknown and existing emails, emailing only existing ones', async () => {
      const user = await createVerifiedUser(prisma, { locale: 'ru' });

      const unknown = await forgot('nobody@example.test');
      const known = await forgot(user.email.toUpperCase());

      expect(unknown.body).toEqual(known.body);
      expect((await mail.waitFor(user.email)).subject).toBe('Смена пароля — Łowisko');
      expect(mail.to('nobody@example.test')).toEqual([]);
    });

    it('sets the new password and logs out every device', async () => {
      const user = await createVerifiedUser(prisma);
      const session = await login(app, user.email);
      await forgot(user.email);
      await mail.waitFor(user.email);

      await reset(mail.tokenFor(user.email)).expect(204);

      await refresh(session.cookie).expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await login(app, user.email, 'a brand new password');
    });

    it('confirms the email of an account that never opened the confirmation link', async () => {
      const user = await createVerifiedUser(prisma, { emailVerifiedAt: null });
      await forgot(user.email);
      await mail.waitFor(user.email);

      await reset(mail.tokenFor(user.email)).expect(204);

      await login(app, user.email, 'a brand new password');
    });

    it('accepts a link once, for 1 hour, and only the latest one', async () => {
      const user = await createVerifiedUser(prisma);
      await forgot(user.email);
      await mail.waitFor(user.email);
      const first = mail.tokenFor(user.email);
      mail.sent.length = 0;
      await forgot(user.email);
      await mail.waitFor(user.email);
      const latest = mail.tokenFor(user.email);

      expect((await reset(first).expect(400)).body).toMatchObject({ code: 'INVALID_TOKEN' });
      at(HOUR + 1);
      expect((await reset(latest).expect(401)).body).toMatchObject({ code: 'TOKEN_EXPIRED' });
      at(HOUR - 1);
      await reset(latest).expect(204);
      expect((await reset(latest).expect(400)).body).toMatchObject({ code: 'INVALID_TOKEN' });
    });

    it('rejects a too short new password without using up the link', async () => {
      const user = await createVerifiedUser(prisma);
      await forgot(user.email);
      await mail.waitFor(user.email);
      const token = mail.tokenFor(user.email);

      expect((await reset(token, 'short').expect(400)).body).toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await reset(token).expect(204);
    });
  });

  describe('rate limits', () => {
    it('allows 20 anonymous auth requests per minute from one IP', async () => {
      for (let i = 0; i < 20; i++) {
        await http()
          .post('/api/v1/auth/verify-email')
          .send({ token: `made-up-${i}` })
          .expect(400);
      }

      const blocked = await http()
        .post('/api/v1/auth/register')
        .send({ ...registration, email: 'late@example.test' })
        .expect(429);

      expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('does not limit refreshing per IP', async () => {
      const user = await createVerifiedUser(prisma);
      let { cookie } = await login(app, user.email);

      for (let i = 0; i < 25; i++) {
        cookie = refreshCookie(await refresh(cookie).expect(200)) ?? '';
      }
    });

    it('sends at most 3 reset emails an hour to one address', async () => {
      const user = await createVerifiedUser(prisma);
      const forgot = (email: string) => http().post('/api/v1/auth/forgot-password').send({ email });

      for (let i = 0; i < 3; i++) {
        await forgot(user.email).expect(204);
      }

      expect((await forgot(user.email.toUpperCase()).expect(429)).body).toMatchObject({
        code: 'RATE_LIMITED',
      });
      await forgot('someone-else@example.test').expect(204);
    });
  });

  it('revokes a token rotated at the same moment as a password reset', async () => {
    const user = await createVerifiedUser(prisma);
    const thief = await login(app, user.email);
    await http().post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(204);
    await mail.waitFor(user.email);
    const token = mail.tokenFor(user.email);

    await Promise.all([
      refresh(thief.cookie),
      http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'a brand new password' })
        .expect(204),
    ]);

    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });
});

function randomId(): string {
  return crypto.randomUUID();
}
