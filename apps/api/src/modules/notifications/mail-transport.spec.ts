import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { createSmtpTransport, SMTP_TIMEOUTS } from './mail-transport';

describe('createSmtpTransport', () => {
  const transportOptions = (smtpUrl: string) => {
    const config = { get: () => smtpUrl } as unknown as ConfigService<Env, true>;
    const mailer = createSmtpTransport(config) as unknown as {
      transporter: { options: Record<string, unknown> };
    };
    return mailer.transporter.options;
  };

  it('connects to SMTP_URL with timeouts far shorter than nodemailer’s', () => {
    expect(transportOptions('smtp://mail.example.test:2525')).toMatchObject({
      host: 'mail.example.test',
      port: 2525,
      ...SMTP_TIMEOUTS,
    });
    expect(SMTP_TIMEOUTS.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(SMTP_TIMEOUTS.socketTimeout).toBeLessThanOrEqual(20_000);
  });

  it('lets SMTP_URL set its own timeout', () => {
    expect(transportOptions('smtp://mail.example.test:2525?connectionTimeout=3000')).toMatchObject({
      connectionTimeout: 3000,
    });
  });
});
