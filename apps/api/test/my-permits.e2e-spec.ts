import type { NestExpressApplication } from '@nestjs/platform-express';
import { decodeJwt } from 'jose';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { QrTokenService } from '../src/modules/permits/qr/qr-token.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization, createPermit, createPermitType, createWater } from './factories';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface MyPermit {
  id: string;
  number: string;
  status: string;
  validFrom: string;
  validTo: string;
  qrToken: string | null;
}

/** `res.body` of a binary response, collected as a Buffer. */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

// FIXED_NOW is 2026-10-06 17:20 in Warsaw.
describe('my permits', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let angler: { id: string; accessToken: string };
  let permitTypeId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const paidPermit = (validFrom: string, validTo: string, data: object = {}) =>
    createPermit(prisma, {
      userId: angler.id,
      permitTypeId,
      status: 'PAID',
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      ...data,
    });

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    const organization = await createOrganization(prisma, { status: 'ACTIVE', name: 'Koło PZW 7' });
    const waters = await Promise.all(
      ['Zalew Zegrzyński', 'Jezioro Łańskie'].map((name) =>
        createWater(prisma, { name, status: 'CONNECTED', organizationId: organization.id }),
      ),
    );
    permitTypeId = (
      await createPermitType(prisma, {
        organizationId: organization.id,
        name: 'Tygodniowe',
        durationDays: 7,
        waters: { connect: waters.map(({ id }) => ({ id })) },
      })
    ).id;
    const user = await createVerifiedUser(prisma, { firstName: 'Józef', lastName: 'Żółć' });
    angler = { id: user.id, accessToken: (await login(app, user.email)).accessToken };
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('GET /me/permits', () => {
    it('lists only my permits, latest start first, with computed statuses', async () => {
      const active = await paidPermit('2026-10-05', '2026-10-11');
      const scheduled = await paidPermit('2026-11-01', '2026-11-07');
      const expired = await paidPermit('2026-09-01', '2026-09-07');
      const cancelled = await paidPermit('2026-10-20', '2026-10-26', { status: 'CANCELLED' });
      await createPermit(prisma, { permitTypeId });

      const response = await request(server())
        .get('/api/v1/me/permits')
        .set(bearer(angler.accessToken))
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      const permits = response.body as MyPermit[];
      expect(permits.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: scheduled.id, status: 'SCHEDULED' },
        { id: cancelled.id, status: 'CANCELLED' },
        { id: active.id, status: 'ACTIVE' },
        { id: expired.id, status: 'EXPIRED' },
      ]);
      expect(permits[0]).toMatchObject({
        permitType: { id: permitTypeId, name: 'Tygodniowe' },
        organization: { name: 'Koło PZW 7' },
        // The waters of the type, which the permit covers (BR-01), by name.
        waters: [{ name: 'Jezioro Łańskie' }, { name: 'Zalew Zegrzyński' }],
      });
    });

    it('gives a QR token only to scheduled and active permits', async () => {
      await paidPermit('2026-10-05', '2026-10-11');
      await paidPermit('2026-11-01', '2026-11-07');
      await paidPermit('2026-09-01', '2026-09-07');
      await paidPermit('2026-10-01', '2026-10-31', { status: 'REVOKED' });
      await createPermit(prisma, { userId: angler.id, permitTypeId });

      const response = await request(server())
        .get('/api/v1/me/permits')
        .set(bearer(angler.accessToken))
        .expect(200);

      const tokens = Object.fromEntries(
        (response.body as MyPermit[]).map(({ status, qrToken }) => [status, qrToken !== null]),
      );
      expect(tokens).toEqual({
        SCHEDULED: true,
        ACTIVE: true,
        EXPIRED: false,
        REVOKED: false,
        PENDING_PAYMENT: false,
      });
    });

    it('is empty for an angler without permits', async () => {
      await paidPermit('2026-10-05', '2026-10-11');
      const other = await createVerifiedUser(prisma);
      const { accessToken } = await login(app, other.email);

      const response = await request(server()).get('/api/v1/me/permits').set(bearer(accessToken));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('requires authentication', async () => {
      await request(server()).get('/api/v1/me/permits').expect(401);
    });
  });

  describe('GET /me/permits/:id', () => {
    it('returns a QR token for this permit that expires after its last Warsaw day', async () => {
      const permit = await paidPermit('2026-10-05', '2026-10-11');

      const response = await request(server())
        .get(`/api/v1/me/permits/${permit.id}`)
        .set(bearer(angler.accessToken))
        .expect(200);

      const { qrToken } = response.body as MyPermit;
      expect(qrToken).toEqual(expect.any(String));
      expect(decodeJwt(qrToken!)).toEqual({
        sub: permit.id,
        exp: Date.parse('2026-10-11T22:00:00Z') / 1000,
      });
      expect(await app.get(QrTokenService).verify(qrToken!)).toBe(permit.id);
    });

    it('has no QR token for an expired permit', async () => {
      const permit = await paidPermit('2026-09-01', '2026-09-07');

      const response = await request(server())
        .get(`/api/v1/me/permits/${permit.id}`)
        .set(bearer(angler.accessToken))
        .expect(200);

      expect(response.body).toMatchObject({ status: 'EXPIRED', qrToken: null });
    });
  });

  describe('GET /me/permits/:id/pdf', () => {
    const pdf = (id: string, token = angler.accessToken) =>
      request(server())
        .get(`/api/v1/me/permits/${id}/pdf`)
        .set(bearer(token))
        .buffer(true)
        .parse(binary);

    it('downloads an active permit as an uncached PDF attachment named by its number', async () => {
      const permit = await paidPermit('2026-10-05', '2026-10-11');

      const response = await pdf(permit.id).expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="${permit.number}.pdf"`,
      );
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.body as Buffer;
      expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(body.toString('latin1')).toMatch(/\/BaseFont \/\w+\+Onest-Regular/);
    });

    it('downloads a scheduled permit', async () => {
      const permit = await paidPermit('2026-11-01', '2026-11-07');

      await pdf(permit.id).expect(200);
    });

    it.each([
      ['an expired permit', { validFrom: '2026-09-01', validTo: '2026-09-07' }, 'EXPIRED'],
      ['a revoked permit', { status: 'REVOKED' }, 'REVOKED'],
      ['an unpaid permit', { status: 'PENDING_PAYMENT' }, 'PENDING_PAYMENT'],
    ])('refuses %s with PERMIT_NOT_VALID', async (_case, change, status) => {
      const {
        validFrom = '2026-10-05',
        validTo = '2026-10-11',
        ...data
      } = change as {
        validFrom?: string;
        validTo?: string;
      };
      const permit = await paidPermit(validFrom, validTo, data);

      const response = await request(server())
        .get(`/api/v1/me/permits/${permit.id}/pdf`)
        .set(bearer(angler.accessToken));

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'PERMIT_NOT_VALID', details: { status } });
    });

    it('treats a permit of someone else as missing', async () => {
      const someoneElses = await createPermit(prisma, {
        permitTypeId,
        status: 'PAID',
        validFrom: new Date('2026-10-05'),
        validTo: new Date('2026-10-11'),
      });

      for (const id of [someoneElses.id, UNKNOWN_ID]) {
        const response = await request(server())
          .get(`/api/v1/me/permits/${id}/pdf`)
          .set(bearer(angler.accessToken));
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
      }
    });

    it('requires authentication', async () => {
      await request(server()).get(`/api/v1/me/permits/${UNKNOWN_ID}/pdf`).expect(401);
    });
  });
});
