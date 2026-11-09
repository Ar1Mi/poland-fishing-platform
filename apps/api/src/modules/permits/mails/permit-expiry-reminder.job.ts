import { WARSAW_TIME_ZONE } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { PermitMailsService } from './permit-mails.service';

/**
 * Every hour from 8:00 to 20:00 Warsaw time: the first run of the day sends that day's reminders,
 * the later ones catch up with what failed or what an outage missed — never at night.
 */
export const EXPIRY_REMINDER_CRON = '0 8-20 * * *';

/** Sends the permit expiry reminders that are due (FR-21, docs/02-business-rules.md). */
@Injectable()
export class PermitExpiryReminderJob {
  constructor(
    private readonly mails: PermitMailsService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(PermitExpiryReminderJob.name);
  }

  // A slow run (many reminders, a slow mail server) is not overlapped by the next one.
  @Cron(EXPIRY_REMINDER_CRON, {
    name: 'permit-expiry-reminders',
    timeZone: WARSAW_TIME_ZONE,
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const { sent, failed } = await this.mails.sendDueExpiryReminders();
      if (failed > 0) {
        this.logger.warn({ sent, failed }, 'Permit expiry reminders stopped, the rest go next run');
      } else if (sent > 0) {
        this.logger.info({ sent }, 'Permit expiry reminders sent');
      }
    } catch (err) {
      this.logger.error({ err }, 'Sending permit expiry reminders failed');
    }
  }
}
