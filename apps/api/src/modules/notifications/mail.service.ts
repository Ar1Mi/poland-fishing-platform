import type { Locale } from '@lowisko/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';
import { emailVerificationTemplate, passwordResetTemplate, type MailContent } from './templates';

export interface MailRecipient {
  email: string;
  firstName: string;
  locale: Locale;
}

/**
 * Account emails. Sending never throws: a mail server outage must not fail the request
 * (the account already exists), so the failure goes to the log instead.
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

  private webLink(path: string, token: string): string {
    const url = new URL(path, this.config.get('WEB_URL', { infer: true }));
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async send(to: MailRecipient, content: MailContent): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.config.get('MAIL_FROM', { infer: true }),
        to: to.email,
        ...content,
      });
    } catch (err) {
      // The message body holds a one-time token, so only the subject is logged.
      this.logger.error({ err, subject: content.subject }, 'Sending email failed');
    }
  }
}
