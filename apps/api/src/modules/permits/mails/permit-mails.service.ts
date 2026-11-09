import {
  addDays,
  EffectivePermitStatus,
  PERMIT_EXPIRY_REMINDER_DAYS,
  warsawDate,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClockService } from '../../../common/clock/clock.service';
import { PrismaService } from '../../../database/prisma.service';
import { MailService, type MailRecipient } from '../../notifications/mail.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { UsersService } from '../../users/users.service';
import type { MyPermitDto } from '../dto/permit.dto';
import { MyPermitsService } from '../my-permits/my-permits.service';

/** Permits taken for reminders at once; a run goes on with the next batch. */
const REMINDER_BATCH = 200;

type Outcome = 'sent' | 'skipped' | 'failed';

export interface ReminderRun {
  sent: number;
  /** Released for the next run: sending failed, the run stopped there. */
  failed: number;
}

/**
 * Emails to the angler about a platform permit (FR-21, T-25): bought, about to expire, revoked.
 * The permit is described as the angler sees it in `/me/permits` (MyPermitsService), in the
 * angler's language. An email is sent after the change committed and never fails the change:
 * every method logs what went wrong and returns. An anonymised account (RODO) gets nothing.
 */
@Injectable()
export class PermitMailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly myPermits: MyPermitsService,
    private readonly users: UsersService,
    private readonly organizations: OrganizationsService,
    private readonly mail: MailService,
    private readonly clock: ClockService,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(PermitMailsService.name);
  }

  /** The permit became PAID: its payment was confirmed, or the type is free. */
  async purchased(permitId: string): Promise<void> {
    await this.sendAbout(permitId, 'purchase', (to, permit) =>
      this.mail.sendPermitPurchased(to, {
        ...describe(permit),
        pricePaidGrosze: permit.pricePaidGrosze,
      }),
    );
  }

  /** The organization revoked the permit: its reason and where to ask about a refund. */
  async revoked(permitId: string): Promise<void> {
    await this.sendAbout(permitId, 'revocation', async (to, permit) => {
      const organization = await this.organizations.findContact(permit.organization.id);
      return this.mail.sendPermitRevoked(to, {
        ...describe(permit),
        reason: permit.revokeReason ?? '',
        // The type keeps its organization (FK), so the contact always exists.
        organizationEmail: organization?.contactEmail ?? '',
      });
    });
  }

  /**
   * Sends the reminders due today (docs/02-business-rules.md → «Напоминание об истечении»).
   * A permit is taken by marking it (`expiryReminderSentAt`) in the statement that selects it,
   * SKIP LOCKED: a run on another instance takes other permits, and a permit is never reminded
   * twice. A failed email is unmarked and the run stops — the mail server is likely down; the
   * next run tries again until the permit's last day.
   */
  async sendDueExpiryReminders(): Promise<ReminderRun> {
    const now = this.clock.now();
    let sent = 0;
    for (;;) {
      const batch = await this.takeDueReminders(now);
      for (const [index, permit] of batch.entries()) {
        const outcome = await this.sendAbout(permit.id, 'expiry reminder', (to, dto) =>
          // Revoked after it was taken: no reminder (the flag stays, it is not due any more).
          dto.status === EffectivePermitStatus.ACTIVE
            ? this.mail.sendPermitExpiryReminder(to, describe(dto))
            : Promise.resolve(null),
        );
        if (outcome === 'failed') {
          const left = batch.slice(index).map(({ id }) => id);
          await this.prisma.permit.updateMany({
            where: { id: { in: left }, expiryReminderSentAt: now },
            data: { expiryReminderSentAt: null },
          });
          return { sent, failed: left.length };
        }
        if (outcome === 'sent') {
          sent += 1;
        }
      }
      if (batch.length < REMINDER_BATCH) {
        return { sent, failed: 0 };
      }
    }
  }

  /**
   * Marks a batch of permits whose reminder is due on the Warsaw day of `now`: PAID, not
   * reminded, `validTo − 3 ≤ today ≤ validTo`, and lasting long enough to be reminded
   * (`validFrom < validTo − 3`, `hasExpiryReminder` in packages/shared). `FOR NO KEY UPDATE`:
   * the key does not change, so a catch synced on the permit meanwhile does not wait.
   */
  private takeDueReminders(now: Date): Promise<{ id: string }[]> {
    const today = warsawDate(now);
    const lastDueValidTo = addDays(today, PERMIT_EXPIRY_REMINDER_DAYS);
    return this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Permit" SET "expiryReminderSentAt" = ${now}::timestamptz
      WHERE "id" IN (
        SELECT "id" FROM "Permit"
        WHERE "status" = 'PAID' AND "expiryReminderSentAt" IS NULL
          AND "validTo" BETWEEN ${today}::date AND ${lastDueValidTo}::date
          AND "validFrom" < "validTo" - ${PERMIT_EXPIRY_REMINDER_DAYS}::int
        ORDER BY "validTo", "id"
        LIMIT ${REMINDER_BATCH}
        FOR NO KEY UPDATE SKIP LOCKED)
      RETURNING "id"`;
  }

  /**
   * Loads the permit and its holder and sends; `send` resolves to whether the email went out,
   * or null when there was nothing to send. Never throws.
   */
  private async sendAbout(
    permitId: string,
    kind: string,
    send: (to: MailRecipient, permit: MyPermitDto) => Promise<boolean | null>,
  ): Promise<Outcome> {
    try {
      const holder = await this.prisma.permit.findUnique({
        where: { id: permitId },
        select: { userId: true },
      });
      const user = holder && (await this.users.findById(holder.userId));
      if (!holder || !user) {
        return 'skipped';
      }
      const permit = await this.myPermits.get(user.id, permitId);
      const sent = await send(user, permit);
      return sent === null ? 'skipped' : sent ? 'sent' : 'failed';
    } catch (err) {
      this.logger.error({ err, permitId }, `Preparing the permit ${kind} email failed`);
      return 'failed';
    }
  }
}

/** What every permit email says about the permit. */
function describe(permit: MyPermitDto) {
  return {
    id: permit.id,
    number: permit.number,
    typeName: permit.permitType.name,
    organizationName: permit.organization.name,
    waterNames: permit.waters.map((water) => water.name),
    validFrom: permit.validFrom,
    validTo: permit.validTo,
  };
}
