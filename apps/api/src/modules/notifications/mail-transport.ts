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

/** SMTP transporter (Mailpit in development). It connects only when a message is sent. */
export function createSmtpTransport(config: ConfigService<Env, true>): MailTransport {
  return createTransport(config.get('SMTP_URL', { infer: true }));
}
