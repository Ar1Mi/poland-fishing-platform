import type { MailMessage, MailTransport } from '../../src/modules/notifications/mail-transport';

/** Errors shaped like nodemailer's: MailService tells them apart by these fields. */
const recipientRefused = () =>
  Object.assign(new Error("Can't send mail - all recipients were rejected"), {
    code: 'EENVELOPE',
    responseCode: 550,
    command: 'RCPT TO',
  });
const connectionTimeout = () =>
  Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT', command: 'CONN' });

/** Collects messages instead of talking SMTP (tests never reach a real mail server). */
export class FakeMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];
  /** Every attempt, sent or not, by recipient. */
  readonly attempts: string[] = [];
  failNext = false;
  /** Addresses whose server refuses every message for good (550 to RCPT TO). */
  readonly refused = new Set<string>();
  /** Addresses whose next message fails for now (a timeout); the one after goes through. */
  readonly failOnceFor = new Set<string>();
  /** Addresses that cannot be reached at all for now: every message to them times out. */
  readonly unreachable = new Set<string>();
  /** The mail server is down: every message times out until this is set back. */
  down = false;

  sendMail(message: MailMessage): Promise<void> {
    this.attempts.push(message.to);
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP connection refused'));
    }
    if (this.refused.has(message.to)) {
      return Promise.reject(recipientRefused());
    }
    if (this.down || this.unreachable.has(message.to) || this.failOnceFor.delete(message.to)) {
      return Promise.reject(connectionTimeout());
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  to(email: string): MailMessage[] {
    return this.sent.filter((message) => message.to === email);
  }

  attemptsTo(email: string): number {
    return this.attempts.filter((to) => to === email).length;
  }

  /** For emails sent without awaiting (forgot-password). */
  async waitFor(email: string, timeoutMs = 2000): Promise<MailMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const message = this.to(email).at(-1);
      if (message) return message;
      if (Date.now() > deadline) throw new Error(`No email to ${email}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** The `token` query parameter of the link in the last email to `email`. */
  tokenFor(email: string): string {
    const message = this.to(email).at(-1);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    const token = link && new URL(link).searchParams.get('token');
    if (!token) throw new Error(`No link with a token in the email to ${email}`);
    return token;
  }
}
