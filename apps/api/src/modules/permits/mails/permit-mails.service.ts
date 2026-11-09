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
import {
  MailService,
  type MailOutcome,
  type MailRecipient,
} from '../../notifications/mail.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { UsersService } from '../../users/users.service';
import type { MyPermitDto } from '../dto/permit.dto';
import { MyPermitsService } from '../my-permits/my-permits.service';

/**
 * Permits marked for reminders at once. Marked permits whose email has not gone out yet are lost
 * if the process stops (a deploy, a crash), so the batch is small.
 */
export const REMINDER_BATCH = 20;

/** Failures in a row after which a run stops: the mail server is likely down, not one mailbox. */
export const REMINDER_FAILURES_TO_STOP = 3;

type Outcome = MailOutcome | 'skipped';

export interface ReminderRun {
  sent: number;
  /** Refused for good by the recipient's server (a dead mailbox): not tried again. */
  rejected: number;
  /** Failed for now and unmarked: the next run tries them again. */
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
    await this.sendAbout(permitId, 'revocation', async (to, permit) =>
      this.mail.sendPermitRevoked(to, {
        ...describe(permit),
        // Required on revocation; the type keeps its organization (FK) with a NOT NULL address.
        reason: permit.revokeReason ?? '',
        organizationEmail:
          (await this.organizations.findContactEmail(permit.organization.id)) ?? '',
      }),
    );
  }

  /**
   * Sends the reminders due today (docs/02-business-rules.md → «Напоминание об истечении»).
   * Permits are marked (`expiryReminderSentAt`) by the statement that selects them, SKIP LOCKED:
   * a run on another instance takes other permits, and no permit is reminded twice. A permit
   * whose email failed for now is unmarked for the next run and not taken again in this one; a
   * mailbox refused for good keeps the mark. After REMINDER_FAILURES_TO_STOP failures in a row
   * the run stops and unmarks the rest of its batch.
   */
  async sendDueExpiryReminders(): Promise<ReminderRun> {
    const now = this.clock.now();
    const run: ReminderRun = { sent: 0, rejected: 0, failed: 0 };
    // Unmarked by this run: it does not take them again, so it always ends.
    const failed: string[] = [];
    let failuresInRow = 0;
    for (;;) {
      const batch = await this.takeDueReminders(now, failed);
      for (const [index, { id }] of batch.entries()) {
        const outcome = await this.sendAbout(id, 'expiry reminder', (to, permit) =>
          // Revoked after it was taken: no reminder (it keeps the mark, nothing is due any more).
          permit.status === EffectivePermitStatus.ACTIVE
            ? this.mail.sendPermitExpiryReminder(to, describe(permit))
            : Promise.resolve('skipped' as const),
        );
        if (outcome !== 'failed') {
          failuresInRow = 0;
          if (outcome !== 'skipped') {
            run[outcome] += 1;
          }
          continue;
        }
        failuresInRow += 1;
        if (failuresInRow >= REMINDER_FAILURES_TO_STOP) {
          // This permit and the untried rest of the batch; earlier failures are unmarked already.
          const left = batch.slice(index).map((permit) => permit.id);
          await this.unmark(left, now);
          run.failed += left.length;
          return run;
        }
        await this.unmark([id], now);
        failed.push(id);
        run.failed += 1;
      }
      if (batch.length < REMINDER_BATCH) {
        return run;
      }
    }
  }

  /**
   * Marks a batch of permits whose reminder is due on the Warsaw day of `now`: PAID, not
   * reminded, `validTo − 3 ≤ today ≤ validTo`, and lasting long enough to be reminded
   * (`validFrom < validTo − 3`, `hasExpiryReminder` in packages/shared), except those that failed
   * in this run. `FOR NO KEY UPDATE`: the key does not change, so a catch synced on the permit
   * meanwhile does not wait.
   */
  private takeDueReminders(now: Date, except: string[]): Promise<{ id: string }[]> {
    const today = warsawDate(now);
    const lastDueValidTo = addDays(today, PERMIT_EXPIRY_REMINDER_DAYS);
    return this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Permit" SET "expiryReminderSentAt" = ${now}::timestamptz
      WHERE "id" IN (
        SELECT "id" FROM "Permit"
        WHERE "status" = 'PAID' AND "expiryReminderSentAt" IS NULL
          AND "validTo" BETWEEN ${today}::date AND ${lastDueValidTo}::date
          AND "validFrom" < "validTo" - ${PERMIT_EXPIRY_REMINDER_DAYS}::int
          AND NOT ("id" = ANY(${except}::uuid[]))
        ORDER BY "validTo", "id"
        LIMIT ${REMINDER_BATCH}
        FOR NO KEY UPDATE SKIP LOCKED)
      RETURNING "id"`;
  }

  /** Back to "not reminded" — only the marks this run set. */
  private async unmark(ids: string[], markedAt: Date): Promise<void> {
    await this.prisma.permit.updateMany({
      where: { id: { in: ids }, expiryReminderSentAt: markedAt },
      data: { expiryReminderSentAt: null },
    });
  }

  /**
   * Loads the permit and its holder and sends. A failure to prepare the email counts as
   * `failed`, like a failure to send it. Never throws.
   */
  private async sendAbout(
    permitId: string,
    kind: string,
    send: (to: MailRecipient, permit: MyPermitDto) => Promise<Outcome>,
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
      // The email does not carry the QR token: no signing, no dependency on the QR key.
      return await send(user, await this.myPermits.get(user.id, permitId, { signQr: false }));
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
