import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { notificationSign, verifySign } from '../src/modules/permits/payments/p24/p24-sign';
import { Przelewy24Provider } from '../src/modules/permits/payments/p24/przelewy24.provider';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization, createPermitType, createWater } from './factories';

const P24_URL = 'https://sandbox.przelewy24.pl';
const MERCHANT_ID = 11111;
const POS_ID = 22222;
const CRC = 'test-crc-key';
const ORDER_ID = 316565874;

/**
 * Przelewy24 REST API answering from memory: real calls from tests are not allowed
 * (.claude/rules/testing.md). It records what it was sent.
 */
class FakeP24Api {
  registered: Record<string, unknown>[] = [];
  verified: Record<string, unknown>[] = [];
  failVerification = false;

  readonly fetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = new URL(url instanceof Request ? url.url : url).pathname;
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    if (path === '/api/v1/transaction/register') {
      this.registered.push(body);
      return Promise.resolve(Response.json({ data: { token: 'TOKEN-1' }, responseCode: 0 }));
    }
    if (path === '/api/v1/transaction/verify') {
      this.verified.push(body);
      return Promise.resolve(
        this.failVerification
          ? Response.json({ error: 'Invalid sign', code: 400 }, { status: 400 })
          : Response.json({ data: { status: 'success' }, responseCode: 0 }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

describe('Przelewy24 notification', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let p24: FakeP24Api;

  const server = () => app.getHttpServer();

  const notify = (body: object) =>
    request(server()).post('/api/v1/payments/p24/notification').send(body);

  /** A notification signed the way P24 signs it. */
  const signed = (sessionId: string, overrides: Record<string, unknown> = {}) => {
    const fields = {
      merchantId: MERCHANT_ID,
      posId: POS_ID,
      sessionId,
      amount: 2500,
      originAmount: 2500,
      currency: 'PLN',
      orderId: ORDER_ID,
      methodId: 154,
      statement: 'p24-A1B-C2D-E3F',
      ...overrides,
    };
    return { ...fields, sign: notificationSign(fields, CRC) };
  };

  /** Buys a 25 zł permit; returns it and its payment session. */
  const buy = async () => {
    const organizationId = (await createOrganization(prisma, { status: 'ACTIVE' })).id;
    const water = await createWater(prisma, { status: 'CONNECTED', organizationId });
    const type = await createPermitType(prisma, {
      name: 'Tygodniowe',
      durationDays: 7,
      priceGrosze: 2500,
      organizationId,
      waters: { connect: [{ id: water.id }] },
    });
    const user = await createVerifiedUser(prisma);
    const { accessToken } = await login(app, user.email);
    const response = await request(server())
      .post('/api/v1/permits')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ permitTypeId: type.id, validFrom: '2026-10-10' })
      .expect(201);
    const { permit, paymentUrl } = response.body as {
      permit: { id: string };
      paymentUrl: string;
    };
    const payment = await prisma.payment.findFirstOrThrow({ where: { permitId: permit.id } });
    return { permitId: permit.id, sessionId: payment.sessionId, paymentUrl };
  };

  const statusOf = async (permitId: string) => {
    const permit = await prisma.permit.findUniqueOrThrow({ where: { id: permitId } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { permitId } });
    return { permit: permit.status, payment: payment.status };
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    p24 = new FakeP24Api();
    const provider = new Przelewy24Provider({
      baseUrl: P24_URL,
      merchantId: MERCHANT_ID,
      posId: POS_ID,
      apiKey: 'report-key',
      crc: CRC,
      fetch: p24.fetch,
    });
    app = await createTestApp({ prisma, paymentProvider: provider });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('registers the purchase with P24 and sends the buyer to its payment page', async () => {
    const { sessionId, paymentUrl, permitId } = await buy();

    expect(paymentUrl).toBe(`${P24_URL}/trnRequest/TOKEN-1`);
    expect(p24.registered).toEqual([
      expect.objectContaining({
        sessionId,
        amount: 2500,
        currency: 'PLN',
        urlReturn: `http://localhost:5173/payment/return?permitId=${permitId}`,
        urlStatus: 'http://localhost:3000/api/v1/payments/p24/notification',
      }),
    ]);
    const payment = await prisma.payment.findFirstOrThrow({ where: { permitId } });
    expect(payment.provider).toBe('P24');
  });

  it('pays the permit for a genuine notification and verifies the transaction', async () => {
    const { permitId, sessionId } = await buy();

    const response = await notify(signed(sessionId)).expect(200);

    expect(response.body).toEqual({ status: 'SUCCEEDED' });
    expect(await statusOf(permitId)).toEqual({ permit: 'PAID', payment: 'SUCCEEDED' });
    const payment = await prisma.payment.findFirstOrThrow({ where: { permitId } });
    expect(payment.providerOrderId).toBe(String(ORDER_ID));
    const verification = { sessionId, orderId: ORDER_ID, amount: 2500, currency: 'PLN' };
    expect(p24.verified).toEqual([
      {
        merchantId: MERCHANT_ID,
        posId: POS_ID,
        ...verification,
        sign: verifySign(verification, CRC),
      },
    ]);
  });

  it('answers a repeated notification with 200 without verifying again', async () => {
    const { sessionId } = await buy();
    await notify(signed(sessionId)).expect(200);

    const response = await notify(signed(sessionId)).expect(200);

    expect(response.body).toEqual({ status: 'SUCCEEDED' });
    expect(p24.verified).toHaveLength(1);
  });

  it.each([
    ['an invalid sign', (sessionId: string) => ({ ...signed(sessionId), sign: 'x'.repeat(96) })],
    ['another merchant', (sessionId: string) => signed(sessionId, { merchantId: 99999 })],
    ['a malformed body', () => ({ hello: 'world' })],
  ])('rejects a notification with %s and changes nothing', async (_case, body) => {
    const { permitId, sessionId } = await buy();

    const response = await notify(body(sessionId)).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await statusOf(permitId)).toEqual({ permit: 'PENDING_PAYMENT', payment: 'PENDING' });
    expect(p24.verified).toHaveLength(0);
  });

  it('rejects a genuine notification of another amount and keeps the payment pending', async () => {
    const { permitId, sessionId } = await buy();

    const response = await notify(signed(sessionId, { amount: 100 })).expect(400);

    expect(response.body).toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect(await statusOf(permitId)).toEqual({ permit: 'PENDING_PAYMENT', payment: 'PENDING' });
    expect(p24.verified).toHaveLength(0);
  });

  it('answers 404 for a genuine notification of an unknown session', async () => {
    await notify(signed('00000000-0000-4000-8000-000000000000')).expect(404);
  });

  it('rolls back when P24 refuses the verification, so the next notification starts over', async () => {
    const { permitId, sessionId } = await buy();
    p24.failVerification = true;

    await notify(signed(sessionId)).expect(500);

    expect(await statusOf(permitId)).toEqual({ permit: 'PENDING_PAYMENT', payment: 'PENDING' });

    p24.failVerification = false;
    await notify(signed(sessionId)).expect(200);
    expect(await statusOf(permitId)).toEqual({ permit: 'PAID', payment: 'SUCCEEDED' });
  });

  it('keeps the fake payment route closed', async () => {
    const { sessionId } = await buy();

    await request(server())
      .post(`/api/v1/payments/fake/${sessionId}/complete`)
      .send({ outcome: 'PAID' })
      .expect(404);
  });
});
