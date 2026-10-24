import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';

describe('/me', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let userId: string;
  let accessToken: string;
  let now: Date;

  const get = () =>
    request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
  const patch = (body: object) =>
    request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = FIXED_NOW;
    app = await createTestApp({ prisma, now: () => now });
    const user = await createVerifiedUser(prisma, {
      email: 'jan@example.test',
      anglerCardNo: 'KW-123',
    });
    userId = user.id;
    ({ accessToken } = await login(app, user.email));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('GET returns the profile of the token owner without secrets', async () => {
    const response = await get().expect(200);

    expect(response.body).toEqual({
      id: userId,
      email: 'jan@example.test',
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: '1990-05-01',
      anglerCardNo: 'KW-123',
      locale: 'pl',
      isSuperAdmin: false,
    });
  });

  it('PATCH changes only the given fields and returns the profile', async () => {
    const response = await patch({
      locale: 'en',
      firstName: ' Janek ',
      birthDate: '1991-02-28',
    }).expect(200);

    expect(response.body).toMatchObject({
      firstName: 'Janek',
      lastName: 'Kowalski',
      birthDate: '1991-02-28',
      locale: 'en',
      anglerCardNo: 'KW-123',
    });
    await get()
      .expect(200)
      .expect(({ body }) => expect(body).toEqual(response.body));
  });

  it.each([null, ''])('PATCH with anglerCardNo %j removes the card number', async (value) => {
    const response = await patch({ anglerCardNo: value }).expect(200);

    expect(response.body).toMatchObject({ anglerCardNo: null });
  });

  it('accepts a birth date of today in Warsaw and rejects tomorrow', async () => {
    await patch({ birthDate: '2026-10-06' }).expect(200);
    const response = await patch({ birthDate: '2026-10-07' }).expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { birthDate: ['birthDate must not be in the future'] } },
    });
  });

  it('compares the birth date with the calendar day in Warsaw, not in UTC', async () => {
    now = new Date('2026-10-06T21:59:59.000Z'); // 23:59:59 in Warsaw (CEST)
    ({ accessToken } = await login(app, 'jan@example.test'));
    await patch({ birthDate: '2026-10-07' }).expect(400);

    now = new Date('2026-10-06T22:00:00.000Z'); // 2026-10-07 00:00 in Warsaw, still the 6th in UTC
    await patch({ birthDate: '2026-10-07' }).expect(200);
    await patch({ birthDate: '2026-10-08' }).expect(400);
  });

  it.each([
    ['a null first name', { firstName: null }, 'firstName'],
    ['a blank last name', { lastName: '  ' }, 'lastName'],
    ['an unknown locale', { locale: 'de' }, 'locale'],
    ['an email change', { email: 'other@example.test' }, 'email'],
    ['superadmin rights', { isSuperAdmin: true }, 'isSuperAdmin'],
  ])('PATCH rejects %s', async (_case, body, field) => {
    const response = await patch(body).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(Object.keys((response.body as { details: { fields: object } }).details.fields)).toEqual([
      field,
    ]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ email: 'jan@example.test', isSuperAdmin: false });
  });

  it('answers 401 once the account is anonymised', async () => {
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: FIXED_NOW } });

    const response = await get().expect(401);

    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
