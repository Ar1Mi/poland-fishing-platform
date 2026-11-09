import { INVITATION_TTL_DAYS, type Locale, type OrgRole } from '@lowisko/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';
import {
  permitExpiryReminderTemplate,
  permitPurchasedTemplate,
  permitRevokedTemplate,
  type PermitMail,
  type PermitPurchasedMail,
  type PermitRevokedMail,
} from './permit-templates';
import {
  emailVerificationTemplate,
  invitationTemplate,
  passwordResetTemplate,
  type MailContent,
} from './templates';

export interface MailRecipient {
  email: string;
  firstName: string;
  locale: Locale;
}

/**
 * What became of an email: sent; refused for good by the recipient's server (5xx to RCPT TO — a
 * mailbox that does not exist), which sending again would not change; or failed for now (no
 * connection, a timeout, the server's own trouble), which a later attempt may fix.
 */
export type MailOutcome = 'sent' | 'rejected' | 'failed';

/** The fields of a nodemailer error worth logging: they hold no address and no message body. */
interface SmtpError {
  code?: string;
  responseCode?: number;
  command?: string;
}

/** The permit an email is about: its page link is built from `id`. */
export type MailPermit<T extends PermitMail> = Omit<T, 'firstName' | 'link'> & { id: string };

/**
 * Account and permit emails. Sending never throws: a mail server outage must not fail the
 * request (the account already exists, the permit is paid), so the failure goes to the log
 * instead. Permit emails tell what became of the message (`MailOutcome`): the expiry reminder
 * retries one that failed for now.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(MailService.name);
  }

  /** Link to the web page `/verify-email` that posts the token to the API. */
  async sendEmailVerification(to: MailRecipient, token: string): Promise<void> {
    const link = this.webLink('/verify-email', token);
    await this.send(to, emailVerificationTemplate[to.locale]({ firstName: to.firstName, link }));
  }

  async sendPasswordReset(to: MailRecipient, token: string): Promise<void> {
    const link = this.webLink('/reset-password', token);
    await this.send(to, passwordResetTemplate[to.locale]({ firstName: to.firstName, link }));
  }

  /** Link to the web page `/invitations/accept` that posts the token after login (FR-04). */
  async sendInvitation(
    to: { email: string; locale: Locale },
    invitation: { organizationName: string; role: OrgRole },
    token: string,
  ): Promise<void> {
    const link = this.webLink('/invitations/accept', token);
    await this.send(
      to,
      invitationTemplate[to.locale]({ ...invitation, link, validDays: INVITATION_TTL_DAYS }),
    );
  }

  /** The permit is PAID (FR-21): after a confirmed payment, or at once for a free type. */
  sendPermitPurchased(
    to: MailRecipient,
    permit: MailPermit<PermitPurchasedMail>,
  ): Promise<MailOutcome> {
    return this.send(
      to,
      permitPurchasedTemplate[to.locale]({ ...permit, ...this.greet(to, permit) }),
    );
  }

  /** From three days before the permit's last day (FR-21, docs/02-business-rules.md). */
  sendPermitExpiryReminder(
    to: MailRecipient,
    permit: MailPermit<PermitMail>,
  ): Promise<MailOutcome> {
    return this.send(
      to,
      permitExpiryReminderTemplate[to.locale]({ ...permit, ...this.greet(to, permit) }),
    );
  }

  /** The organization revoked the permit (FR-10): its reason and contact address. */
  sendPermitRevoked(
    to: MailRecipient,
    permit: MailPermit<PermitRevokedMail>,
  ): Promise<MailOutcome> {
    return this.send(
      to,
      permitRevokedTemplate[to.locale]({ ...permit, ...this.greet(to, permit) }),
    );
  }

  /** The recipient's name and the link to the permit page, where its QR code and PDF are. */
  private greet(to: MailRecipient, permit: { id: string }): Pick<PermitMail, 'firstName' | 'link'> {
    const link = new URL(`/me/permits/${permit.id}`, this.config.get('WEB_URL', { infer: true }));
    return { firstName: to.firstName, link: link.toString() };
  }

  private webLink(path: string, token: string): string {
    const url = new URL(path, this.config.get('WEB_URL', { infer: true }));
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async send(to: { email: string }, content: MailContent): Promise<MailOutcome> {
    try {
      await this.transport.sendMail({
        from: this.config.get('MAIL_FROM', { infer: true }),
        to: to.email,
        ...content,
      });
      return 'sent';
    } catch (err) {
      // Not the error itself: its message and the server's reply may name the recipient, and the
      // body may hold a one-time token. The subject and the SMTP codes are enough to act on.
      const { code, responseCode, command } = err as SmtpError;
      const rejected = command === 'RCPT TO' && responseCode !== undefined && responseCode >= 500;
      this.logger.error(
        { code, responseCode, command, subject: content.subject },
        rejected ? 'Email refused by the recipient’s server' : 'Sending email failed',
      );
      return rejected ? 'rejected' : 'failed';
    }
  }
}
