import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env';
import type { MailTransport } from './mail-transport';
import { MailService, type MailRecipient } from './mail.service';

const to: MailRecipient = { email: 'jan@example.test', firstName: 'Jan', locale: 'pl' };
const permit = {
  id: '0b0f7c8e-1111-4c1e-9d4c-2a3b4c5d6e7f',
  number: 'ZW-2026-000123',
  typeName: 'Tygodniowe',
  organizationName: 'Koło PZW 7',
  waterNames: ['Narew'],
  validFrom: '2026-11-04',
  validTo: '2026-11-10',
};

/** A nodemailer-like error; its message and reply name the recipient, as real ones do. */
const smtpError = (fields: { code: string; responseCode?: number; command: string }) =>
  Object.assign(new Error(`Recipient <${to.email}> failed`), {
    ...fields,
    response: `550 5.1.1 <${to.email}>: Recipient address rejected`,
    rejected: [to.email],
  });

describe('MailService', () => {
  const setup = (sendMail: MailTransport['sendMail']) => {
    const logger = { setContext: jest.fn(), error: jest.fn() };
    const config = { get: (key: keyof Env) => (key === 'WEB_URL' ? 'https://lowisko.test' : 'x') };
    const service = new MailService(
      { sendMail: jest.fn(sendMail) },
      config as unknown as ConfigService<Env, true>,
      logger as unknown as PinoLogger,
    );
    return { service, logger };
  };

  it('links the permit page and reports a sent email', async () => {
    const sent: { text: string }[] = [];
    const { service } = setup((message) => {
      sent.push(message);
      return Promise.resolve();
    });

    await expect(service.sendPermitExpiryReminder(to, permit)).resolves.toBe('sent');

    expect(sent[0]?.text).toContain(`https://lowisko.test/me/permits/${permit.id}`);
  });

  it('tells a mailbox refused for good (5xx to RCPT TO) from a failure for now', async () => {
    const refused = setup(() =>
      Promise.reject(smtpError({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' })),
    );
    const greylisted = setup(() =>
      Promise.reject(smtpError({ code: 'EENVELOPE', responseCode: 450, command: 'RCPT TO' })),
    );
    const timeout = setup(() => Promise.reject(smtpError({ code: 'ETIMEDOUT', command: 'CONN' })));
    const serverError = setup(() =>
      Promise.reject(smtpError({ code: 'EMESSAGE', responseCode: 554, command: 'DATA' })),
    );

    await expect(refused.service.sendPermitExpiryReminder(to, permit)).resolves.toBe('rejected');
    await expect(greylisted.service.sendPermitExpiryReminder(to, permit)).resolves.toBe('failed');
    await expect(timeout.service.sendPermitExpiryReminder(to, permit)).resolves.toBe('failed');
    // The server refuses the message itself, not this mailbox: it may take the next one.
    await expect(serverError.service.sendPermitExpiryReminder(to, permit)).resolves.toBe('failed');
  });

  it('logs the subject and the SMTP codes, never the recipient', async () => {
    const { service, logger } = setup(() =>
      Promise.reject(smtpError({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' })),
    );

    await service.sendPermitExpiryReminder(to, permit);

    expect(logger.error).toHaveBeenCalledWith(
      {
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        subject: `Zezwolenie ${permit.number} wkrótce wygaśnie — Łowisko`,
      },
      'Email refused by the recipient’s server',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(to.email);
  });
});
