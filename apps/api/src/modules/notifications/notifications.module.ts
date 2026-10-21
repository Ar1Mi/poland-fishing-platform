import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_TRANSPORT, createSmtpTransport } from './mail-transport';
import { MailService } from './mail.service';

@Module({
  providers: [
    { provide: MAIL_TRANSPORT, useFactory: createSmtpTransport, inject: [ConfigService] },
    MailService,
  ],
  exports: [MailService],
})
export class NotificationsModule {}
