import { addDays, isExpiryReminderDue, permitValidTo } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { PermitMailsService } from '../src/modules/permits/mails/permit-mails.service';
import { PaymentsService } from '../src/modules/permits/payments/payments.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createOrganization,
  createPermit,
  createPermitType,
  createUser,
  createWater,
} from './factories';
import { FakeMailTransport } from './mail/fake-mail-transport';
import { loginOrgMember } from './org-helpers';

const WEB_URL = 'http://localhost:5173';

interface Purchase {
  permit: { id: string; number: string; status: string };
  paymentUrl: string;
}

// Emails to the angler about a platform permit (FR-21, T-25). FIXED_NOW is 2026-10-06 17:20 in
// Warsaw, so "today" is 6 October.
describe('permit emails (FR-21)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let mail: FakeMailTransport;
  let now: Date;
  let organizationId: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const reminders = () => app.get(PermitMailsService).sendDueExpiryReminders();
  const permitLink = (id: string) => `${WEB_URL}/me/permits/${id}`;

  const loginAngler = async (data: Parameters<typeof createVerifiedUser>[1] = {}) => {
    const user = await createVerifiedUser(prisma, data);
    const { accessToken } = await login(app, user.email);
    return { ...user, accessToken };
  };

  /** A weekly type of the organization on sale for a connected water. */
  const typeOnSale = async (data: Parameters<typeof createPermitType>[1] = {}) => {
    const water = await createWater(prisma, {
      name: 'Zalew Zegrzyński',
      status: 'CONNECTED',
      organizationId,
    });
    return createPermitType(prisma, {
      name: 'Tygodniowe',
      durationDays: 7,
      priceGrosze: 2500,
      ...data,
      organizationId,
      waters: { connect: [{ id: water.id }] },
    });
  };

  const buy = async (permitTypeId: string, accessToken: string) =>
    (
      await request(server())
        .post('/api/v1/permits')
        .set(bearer(accessToken))
        .send({ permitTypeId, validFrom: '2026-10-10' })
        .expect(201)
    ).body as Purchase;

  /** «Zapłać» or «Odrzuć» on the fake payment page; «Zapłać» is a notification like P24's. */
  const complete = (paymentUrl: string, outcome: 'PAID' | 'REJECTED') =>
    request(server())
      .post(
        `/api/v1/payments/fake/${new URL(paymentUrl).pathname.replace('/payment/fake/', '')}/complete`,
      )
      .send({ outcome })
      .expect(200);

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = FIXED_NOW;
    mail = new FakeMailTransport();
    app = await createTestApp({ prisma, mail, now: () => now });
    organizationId = (
      await createOrganization(prisma, {
        status: 'ACTIVE',
        name: 'Koło PZW 7',
        contactEmail: 'kolo7@pzw.example',
      })
    ).id;
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('purchase', () => {
    it('sends one email in the angler’s language once the payment is confirmed', async () => {
      const angler = await loginAngler({ locale: 'en' });
      const { permit, paymentUrl } = await buy((await typeOnSale()).id, angler.accessToken);
      expect(mail.to(angler.email)).toEqual([]);

      await complete(paymentUrl, 'PAID');

      const [message, ...more] = mail.to(angler.email);
      expect(more).toEqual([]);
      expect(message?.subject).toBe(`Permit ${permit.number} — purchase confirmation — Łowisko`);
      for (const part of [
        `Hi ${angler.firstName}`,
        'Tygodniowe (Koło PZW 7)',
        'Waters: Zalew Zegrzyński',
        'from 10 October 2026 to 16 October 2026 inclusive',
        'Paid: PLN 25.00',
        permitLink(permit.id),
      ]) {
        expect(message?.text).toContain(part);
      }
    });

    it('sends nothing again for a repeated notification', async () => {
      const angler = await loginAngler();
      const { paymentUrl } = await buy((await typeOnSale()).id, angler.accessToken);

      await complete(paymentUrl, 'PAID');
      await complete(paymentUrl, 'PAID');

      expect(mail.to(angler.email)).toHaveLength(1);
    });

    it('sends nothing for a refused or an abandoned payment', async () => {
      const angler = await loginAngler();
      const type = await typeOnSale();
      const refused = await buy(type.id, angler.accessToken);
      await buy(type.id, angler.accessToken);

      await complete(refused.paymentUrl, 'REJECTED');
      now = new Date(FIXED_NOW.getTime() + 31 * 60_000);
      expect(await app.get(PaymentsService).expireAbandoned()).toBe(1);

      expect(mail.to(angler.email)).toEqual([]);
    });

    it('sends the email of a free permit at once, without a price', async () => {
      const angler = await loginAngler();
      const { permit } = await buy((await typeOnSale({ priceGrosze: 0 })).id, angler.accessToken);

      expect(permit.status).toBe('SCHEDULED');
      const [message] = mail.to(angler.email);
      expect(message?.subject).toBe(`Zezwolenie ${permit.number} — potwierdzenie zakupu — Łowisko`);
      expect(message?.text).toContain('Opłata: bezpłatne');
    });

    it('keeps the payment when the mail server is down', async () => {
      const angler = await loginAngler();
      const { permit, paymentUrl } = await buy((await typeOnSale()).id, angler.accessToken);
      mail.failNext = true;

      await complete(paymentUrl, 'PAID');

      expect(mail.to(angler.email)).toEqual([]);
      expect((await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } })).status).toBe(
        'PAID',
      );
    });
  });

  describe('revocation', () => {
    const revoke = async (permitId: string, reason: string) => {
      const admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      const type = await prisma.permit.findUniqueOrThrow({
        where: { id: permitId },
        select: { permitTypeId: true },
      });
      // The permit's type belongs to the admin's organization.
      await prisma.permitType.update({
        where: { id: type.permitTypeId },
        data: { organizationId: admin.organizationId },
      });
      await prisma.organization.update({
        where: { id: admin.organizationId },
        data: { name: 'Koło PZW 12', contactEmail: 'kolo12@pzw.example' },
      });
      return request(server())
        .post(`/api/v1/orgs/${admin.organizationId}/permits/${permitId}/revoke`)
        .set(bearer(admin.accessToken))
        .send({ reason });
    };

    it('tells the angler, in their language, the reason and whom to ask', async () => {
      const angler = await createUser(prisma, { locale: 'ru', firstName: 'Иван' });
      const permit = await createPermit(prisma, {
        userId: angler.id,
        status: 'PAID',
        validFrom: new Date('2026-10-01'),
        validTo: new Date('2026-10-31'),
      });

      await revoke(permit.id, 'Zwrot przelewem 12.10 — zawody').then((r) =>
        expect(r.status).toBe(200),
      );

      const [message, ...more] = mail.to(angler.email);
      expect(more).toEqual([]);
      expect(message?.subject).toBe(`Разрешение ${permit.number} аннулировано — Łowisko`);
      for (const part of [
        'Здравствуйте, Иван!',
        'Организация Koło PZW 12 аннулировала',
        'с 1 октября 2026 г. по 31 октября 2026 г.',
        'Причина: Zwrot przelewem 12.10 — zawody',
        'kolo12@pzw.example',
        permitLink(permit.id),
      ]) {
        expect(message?.text).toContain(part);
      }
    });

    it('sends nothing when the permit cannot be revoked', async () => {
      const angler = await createUser(prisma);
      const expired = await createPermit(prisma, {
        userId: angler.id,
        status: 'PAID',
        validFrom: new Date('2026-09-01'),
        validTo: new Date('2026-09-30'),
      });

      expect((await revoke(expired.id, 'Zwrot')).status).toBe(422);

      expect(mail.to(angler.email)).toEqual([]);
    });
  });

  describe('expiry reminders', () => {
    /** A permit of a type of the organization; dates are `YYYY-MM-DD`. */
    const permitOf = async (
      userId: string,
      validFrom: string,
      validTo: string,
      data: Parameters<typeof createPermit>[1] = {},
    ) => {
      const type = await typeOnSale();
      return createPermit(prisma, {
        userId,
        permitTypeId: type.id,
        status: 'PAID',
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        ...data,
      });
    };
    const reminded = async () =>
      (
        await prisma.permit.findMany({
          where: { expiryReminderSentAt: { not: null } },
          select: { id: true },
        })
      )
        .map(({ id }) => id)
        .sort();

    it('reminds on the third day before the last one, once, permits of five days and more', async () => {
      const users = await Promise.all(
        Array.from({ length: 5 }, () => createUser(prisma, { firstName: 'Anna' })),
      );
      const [weekUser, fiveUser, fourUser, laterUser, otherUser] = users as [
        (typeof users)[number],
        ...typeof users,
      ];
      const week = await permitOf(weekUser.id, '2026-10-03', '2026-10-09');
      const five = await permitOf(fiveUser!.id, '2026-10-05', '2026-10-09');
      await permitOf(fourUser!.id, '2026-10-06', '2026-10-09');
      await permitOf(laterUser!.id, '2026-10-01', '2026-10-10');
      // Not paid, revoked, expired: never reminded.
      for (const status of ['PENDING_PAYMENT', 'CANCELLED', 'REVOKED'] as const) {
        await permitOf(otherUser!.id, '2026-10-03', '2026-10-09', { status });
      }
      await permitOf(otherUser!.id, '2026-09-01', '2026-10-05');

      expect(await reminders()).toEqual({ sent: 2, failed: 0 });

      expect(await reminded()).toEqual([week.id, five.id].sort());
      expect(mail.to(fourUser!.email)).toEqual([]);
      expect(mail.to(laterUser!.email)).toEqual([]);
      expect(mail.to(otherUser!.email)).toEqual([]);
      const [message] = mail.to(weekUser.email);
      expect(message?.subject).toBe(`Zezwolenie ${week.number} wkrótce wygaśnie — Łowisko`);
      expect(message?.text).toContain('jest ważne do 9 października 2026 włącznie');
      expect(message?.text).toContain('Łowiska: Zalew Zegrzyński');
      expect(message?.text).toContain(permitLink(week.id));

      expect(await reminders()).toEqual({ sent: 0, failed: 0 });
      expect(mail.to(weekUser.email)).toHaveLength(1);
      expect(mail.to(fiveUser!.email)).toHaveLength(1);
    });

    it('selects exactly the permits the shared rule says are due', async () => {
      const user = await createUser(prisma);
      const today = '2026-10-06';
      const permits: { id: string; validFrom: string; validTo: string }[] = [];
      for (let lastDayOffset = -1; lastDayOffset <= 5; lastDayOffset += 1) {
        for (const durationDays of [1, 3, 4, 5, 6, 30]) {
          const validTo = addDays(today, lastDayOffset);
          const validFrom = addDays(validTo, -(durationDays - 1));
          expect(permitValidTo(validFrom, durationDays)).toBe(validTo);
          const { id } = await createPermit(prisma, {
            userId: user.id,
            status: 'PAID',
            validFrom: new Date(validFrom),
            validTo: new Date(validTo),
          });
          permits.push({ id, validFrom, validTo });
        }
      }

      await reminders();

      const due = permits.filter((permit) => isExpiryReminderDue(permit, today));
      expect(due.length).toBeGreaterThan(0);
      expect(await reminded()).toEqual(due.map(({ id }) => id).sort());
      expect(mail.to(user.email)).toHaveLength(due.length);
    });

    it('counts the day by Warsaw time around midnight', async () => {
      const user = await createUser(prisma);
      // Due on 7 October.
      const permit = await permitOf(user.id, '2026-10-01', '2026-10-10');

      now = new Date('2026-10-06T21:59:00.000Z'); // 23:59 on 6 October in Warsaw
      expect(await reminders()).toEqual({ sent: 0, failed: 0 });
      now = new Date('2026-10-06T22:00:00.000Z'); // 00:00 on 7 October in Warsaw
      expect(await reminders()).toEqual({ sent: 1, failed: 0 });

      expect(await reminded()).toEqual([permit.id]);
    });

    it('catches up a missed reminder until the last day, naming that day', async () => {
      const user = await createUser(prisma, { locale: 'en' });
      await permitOf(user.id, '2026-09-07', '2026-10-06');

      await reminders();

      expect(mail.to(user.email)[0]?.text).toContain('is valid until 6 October 2026 inclusive');
    });

    it('sends nothing to an anonymised account and does not try again', async () => {
      const user = await createUser(prisma, { deletedAt: new Date('2026-10-01T00:00:00.000Z') });
      const permit = await permitOf(user.id, '2026-10-03', '2026-10-09');

      expect(await reminders()).toEqual({ sent: 0, failed: 0 });

      expect(mail.sent).toEqual([]);
      expect(await reminded()).toEqual([permit.id]);
    });

    it('stops at a failed email and sends the rest on the next run', async () => {
      const first = await createUser(prisma);
      const second = await createUser(prisma);
      await permitOf(first.id, '2026-10-02', '2026-10-08');
      await permitOf(second.id, '2026-10-03', '2026-10-09');
      mail.failNext = true;

      expect(await reminders()).toEqual({ sent: 0, failed: 2 });
      expect(await reminded()).toEqual([]);

      expect(await reminders()).toEqual({ sent: 2, failed: 0 });
      expect(mail.to(first.email)).toHaveLength(1);
      expect(mail.to(second.email)).toHaveLength(1);
    });

    it('reminds every permit once when two runs go at the same time', async () => {
      const user = await createUser(prisma);
      for (let index = 0; index < 6; index += 1) {
        await permitOf(user.id, '2026-10-03', '2026-10-09');
      }

      const runs = await Promise.all([reminders(), reminders()]);

      expect(runs.reduce((sum, run) => sum + run.sent, 0)).toBe(6);
      expect(mail.to(user.email)).toHaveLength(6);
    });
  });
});
