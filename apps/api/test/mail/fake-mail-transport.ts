import type { MailMessage, MailTransport } from '../../src/modules/notifications/mail-transport';

/** Collects messages instead of talking SMTP (tests never reach a real mail server). */
export class FakeMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];
  failNext = false;

  sendMail(message: MailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP connection refused'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  to(email: string): MailMessage[] {
    return this.sent.filter((message) => message.to === email);
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
