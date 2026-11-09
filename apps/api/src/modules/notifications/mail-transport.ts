import type { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Env } from '../../config/env';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** The part of a nodemailer transporter the application uses; tests replace it with a fake. */
export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/**
 * Emails are sent inside requests (a P24 notification, a revocation) and by the reminder job, so
 * a mail server that hangs must not hold them for nodemailer's defaults (2 min to connect, 10 min
 * of silence). Options in `SMTP_URL` itself win over these.
 */
export const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

/** SMTP transporter (Mailpit in development). It connects only when a message is sent. */
export function createSmtpTransport(config: ConfigService<Env, true>): MailTransport {
  return createTransport({ url: config.get('SMTP_URL', { infer: true }), ...SMTP_TIMEOUTS });
}
