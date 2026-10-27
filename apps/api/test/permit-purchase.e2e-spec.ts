import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { FakePaymentProvider } from '../src/modules/permits/payments/fake/fake-payment.provider';
import type { NewTransaction } from '../src/modules/permits/payments/payment-provider';
import { PaymentsService } from '../src/modules/permits/payments/payments.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createOrganization, createPermit, createPermitType, createWater } from './factories';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const WEB_URL = 'http://localhost:5173';
const minutesAfterNow = (minutes: number) => new Date(FIXED_NOW.getTime() + minutes * 60_000);

/** The fake provider with its confirmations counted and failures on demand. */
class TestPaymentProvider extends FakePaymentProvider {
  confirmed = 0;
  failRegistration = false;
  failConfirmation = false;

  override createTransaction(input: NewTransaction): Promise<{ redirectUrl: string }> {
    return this.failRegistration
      ? Promise.reject(new Error('Gateway unavailable'))
      : super.createTransaction(input);
  }

  override confirm(): Promise<void> {
    if (this.failConfirmation) {
      return Promise.reject(new Error('Verification failed'));
    }
    this.confirmed += 1;
    return Promise.resolve();
  }
}

interface MyPermit {
  id: string;
  number: string;
  status: string;
  validFrom: string;
  validTo: string;
  pricePaidGrosze: number;
  permitType: { id: string; name: string; durationDays: number; discountKind: string };
  organization: { id: string; name: string };
  createdAt: string;
}

interface Purchase {
  permit: MyPermit;
  paymentUrl: string;
}

describe('permit purchase', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let now: Date;
  let payments: PaymentsService;
  let provider: TestPaymentProvider;
  let organizationId: string;
  let angler: { id: string; email: string; accessToken: string };

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const purchase = (body: object, token = angler.accessToken) =>
    request(server()).post('/api/v1/permits').set(bearer(token)).send(body);

  const buy = async (permitTypeId: string, validFrom = '2026-10-10'): Promise<Purchase> =>
    (await purchase({ permitTypeId, validFrom }).expect(201)).body as Purchase;

  const myPermit = async (id: string, token = angler.accessToken): Promise<MyPermit> =>
    (await request(server()).get(`/api/v1/me/permits/${id}`).set(bearer(token)).expect(200))
      .body as MyPermit;

  /** «Zapłać» or «Odrzuć» on the fake payment page: a public call, like the page makes it. */
  const complete = (sessionId: string, outcome: 'PAID' | 'REJECTED', amountGrosze?: number) =>
    request(server())
      .post(`/api/v1/payments/fake/${sessionId}/complete`)
      .send({ outcome, amountGrosze });

  const sessionIdOf = (paymentUrl: string) =>
    new URL(paymentUrl).pathname.replace('/payment/fake/', '');

  const paymentOf = (permitId: string) => prisma.payment.findFirstOrThrow({ where: { permitId } });

  const loginAngler = async (birthDate = '1990-05-01') => {
    const user = await createVerifiedUser(prisma, { birthDate: new Date(birthDate) });
    const { accessToken } = await login(app, user.email);
    return { id: user.id, email: user.email, accessToken };
  };

  /** A type on sale for a water connected to the ACTIVE organization. */
  const typeOnSale = async (data: Parameters<typeof createPermitType>[1] = {}) => {
    const water = await createWater(prisma, { status: 'CONNECTED', organizationId });
    return createPermitType(prisma, {
      name: 'Tygodniowe',
      durationDays: 7,
      priceGrosze: 2500,
      ...data,
      organizationId,
      waters: { connect: [{ id: water.id }] },
    });
  };

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

  /** Another transaction takes `lock` and holds it until `release` is called. */
  const holdLock = async (
    lock: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<unknown>,
  ) => {
    let locked!: () => void;
    let unlock!: () => void;
    const lockedPromise = new Promise<void>((resolve) => (locked = resolve));
    const unlockPromise = new Promise<void>((resolve) => (unlock = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await lock(tx);
        locked();
        await unlockPromise;
      },
      { timeout: 20_000 },
    );
    await lockedPromise;
    return {
      release: async () => {
        unlock();
        await holder;
      },
    };
  };

  /** The access token lives 15 minutes by the clock: moving it far needs a new login. */
  const travelTo = async (date: Date) => {
    now = date;
    angler = { ...angler, accessToken: (await login(app, angler.email)).accessToken };
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = FIXED_NOW;
    provider = new TestPaymentProvider(WEB_URL);
    app = await createTestApp({ prisma, now: () => now, paymentProvider: provider });
    payments = app.get(PaymentsService);
    organizationId = (await createOrganization(prisma, { status: 'ACTIVE', name: 'Koło PZW 7' }))
      .id;
    angler = await loginAngler();
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /permits', () => {
    it('creates a PENDING_PAYMENT permit with a pending payment and sends to the payment page', async () => {
      const type = await typeOnSale();

      const { permit, paymentUrl } = await buy(type.id, '2026-10-10');

      expect(permit).toEqual({
        id: expect.any(String) as unknown,
        number: expect.stringMatching(/^ZW-2026-\d{6}$/) as unknown,
        status: 'PENDING_PAYMENT',
        validFrom: '2026-10-10',
        validTo: '2026-10-16',
        pricePaidGrosze: 2500,
        permitType: { id: type.id, name: 'Tygodniowe', durationDays: 7, discountKind: 'NONE' },
        organization: { id: organizationId, name: 'Koło PZW 7' },
        createdAt: FIXED_NOW.toISOString(),
      });
      const url = new URL(paymentUrl);
      const payment = await paymentOf(permit.id);
      expect(url.origin).toBe(WEB_URL);
      expect(url.pathname).toBe(`/payment/fake/${payment.sessionId}`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        amount: '2500',
        description: `Tygodniowe · ${permit.number}`,
        returnUrl: `${WEB_URL}/payment/return?permitId=${permit.id}`,
      });
      expect(payment).toMatchObject({
        provider: 'FAKE',
        status: 'PENDING',
        amountGrosze: 2500,
        providerOrderId: null,
        createdAt: FIXED_NOW,
      });
      const stored = await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } });
      expect(stored).toMatchObject({ userId: angler.id, status: 'PENDING_PAYMENT' });
    });

    it('sells a permit starting today', async () => {
      const type = await typeOnSale({ durationDays: 1 });

      const { permit } = await buy(type.id, '2026-10-06');

      expect(permit).toMatchObject({ validFrom: '2026-10-06', validTo: '2026-10-06' });
    });

    it('rejects a start before today (BR-09)', async () => {
      const type = await typeOnSale();

      const response = await purchase({ permitTypeId: type.id, validFrom: '2026-10-05' }).expect(
        422,
      );

      expect(response.body).toMatchObject({
        code: 'PERMIT_START_IN_PAST',
        details: { today: '2026-10-06' },
      });
      expect(await prisma.permit.count()).toBe(0);
    });

    it('judges today by the Warsaw calendar day, not by UTC', async () => {
      const type = await typeOnSale();
      // 22:30 UTC on 6 October is already 00:30 on 7 October in Warsaw (CEST).
      await travelTo(new Date('2026-10-06T22:30:00.000Z'));

      await purchase({ permitTypeId: type.id, validFrom: '2026-10-06' }).expect(422);
      await purchase({ permitTypeId: type.id, validFrom: '2026-10-07' }).expect(201);
    });

    it('accepts a start up to 365 days ahead and rejects a later one', async () => {
      const type = await typeOnSale();

      await purchase({ permitTypeId: type.id, validFrom: '2027-10-06' }).expect(201);
      const response = await purchase({ permitTypeId: type.id, validFrom: '2027-10-07' }).expect(
        400,
      );

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { validFrom: ['validFrom must not be after 2027-10-06'] } },
      });
    });

    it.each([
      ['a date that does not exist', { validFrom: '2026-02-30' }, 'validFrom'],
      ['a date with time', { validFrom: '2026-10-10T00:00:00Z' }, 'validFrom'],
      ['a missing date', { validFrom: undefined }, 'validFrom'],
      ['a type id that is not a UUID', { permitTypeId: 'x' }, 'permitTypeId'],
    ])('rejects %s', async (_case, change, field) => {
      const type = await typeOnSale();

      const response = await purchase({
        permitTypeId: type.id,
        validFrom: '2026-10-10',
        ...change,
      }).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(
        Object.keys((response.body as { details: { fields: object } }).details.fields),
      ).toEqual([field]);
    });

    it('answers NOT_FOUND for an unknown type', async () => {
      const response = await purchase({ permitTypeId: UNKNOWN_ID, validFrom: '2026-10-10' }).expect(
        404,
      );

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('refuses a type taken off sale', async () => {
      const type = await typeOnSale({ isActive: false });

      const response = await purchase({ permitTypeId: type.id, validFrom: '2026-10-10' }).expect(
        422,
      );

      expect(response.body).toMatchObject({ code: 'PERMIT_TYPE_INACTIVE' });
    });

    it('refuses a type of a blocked organization', async () => {
      const type = await typeOnSale();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: 'BLOCKED' },
      });

      const response = await purchase({ permitTypeId: type.id, validFrom: '2026-10-10' }).expect(
        422,
      );

      expect(response.body).toMatchObject({ code: 'PERMIT_TYPE_INACTIVE' });
      expect(await prisma.permit.count()).toBe(0);
    });

    describe('discounts (BR-08)', () => {
      it('refuses JUNIOR to an adult', async () => {
        const type = await typeOnSale({ discountKind: 'JUNIOR' });

        const response = await purchase({ permitTypeId: type.id, validFrom: '2026-10-10' }).expect(
          422,
        );

        expect(response.body).toMatchObject({
          code: 'DISCOUNT_NOT_ELIGIBLE',
          details: { discountKind: 'JUNIOR' },
        });
        expect(await prisma.permit.count()).toBe(0);
      });

      it('sells JUNIOR to someone younger than 16 on the first day', async () => {
        const type = await typeOnSale({ discountKind: 'JUNIOR' });
        const junior = await loginAngler('2010-10-11');

        await purchase(
          { permitTypeId: type.id, validFrom: '2026-10-10' },
          junior.accessToken,
        ).expect(201);
      });

      it('judges the age on validFrom, not on the day of buying', async () => {
        const type = await typeOnSale({ discountKind: 'JUNIOR' });
        // 15 today, 16 on 8 October.
        const junior = await loginAngler('2010-10-08');

        await purchase(
          { permitTypeId: type.id, validFrom: '2026-10-07' },
          junior.accessToken,
        ).expect(201);
        await purchase(
          { permitTypeId: type.id, validFrom: '2026-10-08' },
          junior.accessToken,
        ).expect(422);
      });

      it('sells SENIOR from the 65th birthday', async () => {
        const type = await typeOnSale({ discountKind: 'SENIOR' });
        const senior = await loginAngler('1961-10-10');

        await purchase(
          { permitTypeId: type.id, validFrom: '2026-10-09' },
          senior.accessToken,
        ).expect(422);
        await purchase(
          { permitTypeId: type.id, validFrom: '2026-10-10' },
          senior.accessToken,
        ).expect(201);
      });
    });

    it('gives a free permit at once, without a payment', async () => {
      const type = await typeOnSale({ priceGrosze: 0, durationDays: 1 });

      const { permit, paymentUrl } = await buy(type.id, '2026-10-06');

      expect(permit).toMatchObject({ status: 'ACTIVE', pricePaidGrosze: 0 });
      expect(paymentUrl).toBe(`${WEB_URL}/payment/return?permitId=${permit.id}`);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('keeps the price paid when the type gets more expensive later', async () => {
      const type = await typeOnSale();
      const { permit } = await buy(type.id);

      await prisma.permitType.update({ where: { id: type.id }, data: { priceGrosze: 4000 } });

      expect(await myPermit(permit.id)).toMatchObject({ pricePaidGrosze: 2500 });
      expect(await paymentOf(permit.id)).toMatchObject({ amountGrosze: 2500 });
    });

    it('waits for a change of the type in progress and sells at its committed price', async () => {
      const type = await typeOnSale();

      // What PATCH /orgs/:orgId/permit-types/:id does (T-12): lock the type, then change it.
      const change = await holdLock(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PermitType" WHERE "id" = ${type.id}::uuid FOR UPDATE`;
        await tx.permitType.update({ where: { id: type.id }, data: { priceGrosze: 3000 } });
      });
      const sale = purchase({ permitTypeId: type.id, validFrom: '2026-10-10' }).then(
        (result) => result,
      );
      await untilSomeQueryWaitsForLock();
      await change.release();
      const response = await sale;

      expect(response.status).toBe(201);
      expect((response.body as Purchase).permit.pricePaidGrosze).toBe(3000);
    });

    it('cancels the permit when the provider does not register the payment', async () => {
      const type = await typeOnSale();
      provider.failRegistration = true;

      const response = await purchase({ permitTypeId: type.id, validFrom: '2026-10-10' }).expect(
        500,
      );

      expect(response.body).toMatchObject({ code: 'INTERNAL_ERROR' });
      const permit = await prisma.permit.findFirstOrThrow();
      expect(permit.status).toBe('CANCELLED');
      expect(await paymentOf(permit.id)).toMatchObject({ status: 'FAILED' });
    });

    it('needs a logged-in user', async () => {
      const type = await typeOnSale();

      await request(server())
        .post('/api/v1/permits')
        .send({ permitTypeId: type.id, validFrom: '2026-10-10' })
        .expect(401);
    });
  });

  describe('payment', () => {
    it('pays the permit on a confirmed notification', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id, '2026-10-10');

      const response = await complete(sessionIdOf(paymentUrl), 'PAID').expect(200);

      expect(response.body).toEqual({ status: 'SUCCEEDED' });
      expect(provider.confirmed).toBe(1);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'SCHEDULED' });
      const payment = await paymentOf(permit.id);
      expect(payment).toMatchObject({
        status: 'SUCCEEDED',
        providerOrderId: expect.stringMatching(/^FAKE-/) as unknown,
        rawNotification: {
          sessionId: payment.sessionId,
          providerOrderId: payment.providerOrderId,
          amountGrosze: 2500,
        },
      });
    });

    it('does not pay the permit when the buyer only comes back', async () => {
      const type = await typeOnSale();
      const { permit } = await buy(type.id);

      // What /payment/return does: polls the permit; nothing has notified the payment.
      expect(await myPermit(permit.id)).toMatchObject({ status: 'PENDING_PAYMENT' });
      expect(await paymentOf(permit.id)).toMatchObject({ status: 'PENDING' });
    });

    it('cancels the permit when the buyer refuses', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);

      const response = await complete(sessionIdOf(paymentUrl), 'REJECTED').expect(200);

      expect(response.body).toEqual({ status: 'FAILED' });
      expect(await myPermit(permit.id)).toMatchObject({ status: 'CANCELLED' });
      expect(await paymentOf(permit.id)).toMatchObject({ status: 'FAILED' });
    });

    it('changes nothing on a repeated notification', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);
      const sessionId = sessionIdOf(paymentUrl);
      await complete(sessionId, 'PAID').expect(200);
      const paid = await paymentOf(permit.id);

      const again = await complete(sessionId, 'PAID').expect(200);
      const refused = await complete(sessionId, 'REJECTED').expect(200);

      expect(again.body).toEqual({ status: 'SUCCEEDED' });
      expect(refused.body).toEqual({ status: 'SUCCEEDED' });
      expect(await paymentOf(permit.id)).toEqual(paid);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'SCHEDULED' });
      expect(provider.confirmed).toBe(1);
    });

    it('confirms once when two notifications arrive together', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);
      const sessionId = sessionIdOf(paymentUrl);

      const responses = await Promise.all([
        complete(sessionId, 'PAID').expect(200),
        complete(sessionId, 'PAID').expect(200),
      ]);

      expect(responses.map((response) => response.body as unknown)).toEqual([
        { status: 'SUCCEEDED' },
        { status: 'SUCCEEDED' },
      ]);
      expect(provider.confirmed).toBe(1);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'SCHEDULED' });
    });

    it('stores nothing when the provider does not confirm, so the next notification can', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);
      const sessionId = sessionIdOf(paymentUrl);
      provider.failConfirmation = true;

      await complete(sessionId, 'PAID').expect(500);

      // Written before the confirmation and rolled back with it.
      expect(await paymentOf(permit.id)).toMatchObject({
        status: 'PENDING',
        providerOrderId: null,
      });
      expect(await myPermit(permit.id)).toMatchObject({ status: 'PENDING_PAYMENT' });
      provider.failConfirmation = false;
      await complete(sessionId, 'PAID').expect(200);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'SCHEDULED' });
    });

    it('confirms with the provider only after the payment and the permit are written', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);
      // Breaks the invariant «a pending payment has a waiting permit»: writing the permit fails.
      await prisma.permit.update({ where: { id: permit.id }, data: { status: 'REVOKED' } });

      await complete(sessionIdOf(paymentUrl), 'PAID').expect(500);

      expect(provider.confirmed).toBe(0);
      expect(await paymentOf(permit.id)).toMatchObject({ status: 'PENDING' });
    });

    it('does not take the money for a permit that expired before the payment came', async () => {
      // 23:50 in Warsaw: a one-day permit for today and a week one from today.
      await travelTo(new Date('2026-10-06T21:50:00.000Z'));
      const daily = await buy((await typeOnSale({ durationDays: 1 })).id, '2026-10-06');
      const weekly = await buy((await typeOnSale({ durationDays: 7 })).id, '2026-10-06');
      // Paid at 00:05: the one-day permit is over, the week one still has six days.
      await travelTo(new Date('2026-10-06T22:05:00.000Z'));

      const late = await complete(sessionIdOf(daily.paymentUrl), 'PAID').expect(200);
      await complete(sessionIdOf(weekly.paymentUrl), 'PAID').expect(200);

      expect(late.body).toEqual({ status: 'FAILED' });
      expect(await myPermit(daily.permit.id)).toMatchObject({ status: 'CANCELLED' });
      // The notification is kept: the transaction P24 returns to the payer is traceable.
      expect(await paymentOf(daily.permit.id)).toMatchObject({
        status: 'FAILED',
        providerOrderId: expect.stringMatching(/^FAKE-/) as unknown,
      });
      expect(await myPermit(weekly.permit.id)).toMatchObject({ status: 'ACTIVE' });
      expect(provider.confirmed).toBe(1);
    });

    it('rejects a notification with a wrong amount and keeps the payment pending', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);
      const sessionId = sessionIdOf(paymentUrl);

      const response = await complete(sessionId, 'PAID', 2499).expect(400);

      expect(response.body).toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
      expect(await paymentOf(permit.id)).toMatchObject({
        status: 'PENDING',
        providerOrderId: null,
      });
      expect(await myPermit(permit.id)).toMatchObject({ status: 'PENDING_PAYMENT' });
      expect(provider.confirmed).toBe(0);
      // The genuine notification still goes through.
      await complete(sessionId, 'PAID', 2500).expect(200);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'SCHEDULED' });
    });

    it('answers NOT_FOUND for an unknown session and 400 for one that is not a UUID', async () => {
      await complete(UNKNOWN_ID, 'PAID').expect(404);
      await complete('not-a-session', 'PAID').expect(400);
    });

    it('rejects an unknown outcome', async () => {
      const type = await typeOnSale();
      const { paymentUrl } = await buy(type.id);

      const response = await request(server())
        .post(`/api/v1/payments/fake/${sessionIdOf(paymentUrl)}/complete`)
        .send({ outcome: 'MAYBE' })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('abandoned payments', () => {
    it('cancels a permit whose payment stayed pending for more than 30 minutes', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);

      await travelTo(minutesAfterNow(30));
      expect(await payments.expireAbandoned()).toBe(0);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'PENDING_PAYMENT' });

      await travelTo(minutesAfterNow(31));
      expect(await payments.expireAbandoned()).toBe(1);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'CANCELLED' });
      expect(await paymentOf(permit.id)).toMatchObject({ status: 'FAILED' });

      // A notification arriving after that is not confirmed: the permit stays cancelled.
      const late = await complete(sessionIdOf(paymentUrl), 'PAID').expect(200);
      expect(late.body).toEqual({ status: 'FAILED' });
      expect(await myPermit(permit.id)).toMatchObject({ status: 'CANCELLED' });
    });

    it('leaves paid and refused payments alone', async () => {
      const type = await typeOnSale();
      const paid = await buy(type.id);
      const refused = await buy(type.id);
      await complete(sessionIdOf(paid.paymentUrl), 'PAID').expect(200);
      await complete(sessionIdOf(refused.paymentUrl), 'REJECTED').expect(200);

      await travelTo(minutesAfterNow(60));

      expect(await payments.expireAbandoned()).toBe(0);
      expect(await myPermit(paid.permit.id)).toMatchObject({ status: 'SCHEDULED' });
    });

    it('lets a notification that waited for the timeout see the payment failed', async () => {
      const type = await typeOnSale();
      const { permit, paymentUrl } = await buy(type.id);
      const sessionId = sessionIdOf(paymentUrl);
      await travelTo(minutesAfterNow(31));

      // The sweep has locked and failed the payment, and has not committed yet.
      const sweep = await holdLock(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
        await tx.payment.update({ where: { sessionId }, data: { status: 'FAILED' } });
        await tx.permit.update({ where: { id: permit.id }, data: { status: 'CANCELLED' } });
      });
      const notification = complete(sessionId, 'PAID').then((result) => result);
      await untilSomeQueryWaitsForLock();
      await sweep.release();
      const response = await notification;

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'FAILED' });
      expect(provider.confirmed).toBe(0);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'CANCELLED' });
    });

    it('skips a payment that is being confirmed right now', async () => {
      const type = await typeOnSale();
      const { permit } = await buy(type.id);
      const { sessionId } = await paymentOf(permit.id);
      await travelTo(minutesAfterNow(31));

      // What processNotification holds while the provider confirms the payment.
      const confirmation = await holdLock(
        (tx) =>
          tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "sessionId" = ${sessionId} FOR UPDATE`,
      );
      const expired = await payments.expireAbandoned();
      await confirmation.release();

      expect(expired).toBe(0);
      expect(await myPermit(permit.id)).toMatchObject({ status: 'PENDING_PAYMENT' });
    });
  });

  describe('GET /me/permits/:id', () => {
    it('computes the status of a paid permit from its dates', async () => {
      const type = await typeOnSale();
      const today = await createPermit(prisma, {
        userId: angler.id,
        permitTypeId: type.id,
        status: 'PAID',
        validFrom: new Date('2026-10-06'),
        validTo: new Date('2026-10-06'),
      });
      const past = await createPermit(prisma, {
        userId: angler.id,
        permitTypeId: type.id,
        status: 'PAID',
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2026-10-05'),
      });

      expect(await myPermit(today.id)).toMatchObject({ status: 'ACTIVE' });
      expect(await myPermit(past.id)).toMatchObject({ status: 'EXPIRED' });
    });

    it('does not show a permit of someone else', async () => {
      const type = await typeOnSale();
      const { permit } = await buy(type.id);
      const other = await loginAngler();

      const response = await request(server())
        .get(`/api/v1/me/permits/${permit.id}`)
        .set(bearer(other.accessToken))
        .expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('answers NOT_FOUND for an unknown permit', async () => {
      await request(server())
        .get(`/api/v1/me/permits/${UNKNOWN_ID}`)
        .set(bearer(angler.accessToken))
        .expect(404);
    });

    it('rejects an id that is not a UUID', async () => {
      const response = await request(server())
        .get('/api/v1/me/permits/not-a-permit')
        .set(bearer(angler.accessToken))
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});
