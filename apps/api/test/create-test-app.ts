import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { ClockService } from '../src/common/clock/clock.service';
import { PrismaService } from '../src/database/prisma.service';
import { MAIL_TRANSPORT } from '../src/modules/notifications/mail-transport';
import { FakeMailTransport } from './mail/fake-mail-transport';

export const FIXED_NOW = new Date('2026-10-06T15:20:00.000Z');

export interface TestAppOptions extends Pick<ModuleMetadata, 'controllers'> {
  /** Test database (createTestDatabase + prismaServiceFor); without it nothing may query. */
  prisma?: PrismaService;
  /** Defaults to FIXED_NOW; a function lets a test move time forward. */
  now?: () => Date;
  mail?: FakeMailTransport;
}

/** The real application with a fixed clock and a fake mail transport; `controllers` adds test-only routes. */
export async function createTestApp({
  controllers,
  prisma,
  now = () => FIXED_NOW,
  mail = new FakeMailTransport(),
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(ClockService)
    .useValue({ now })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mail);
  if (prisma) {
    builder = builder.overrideProvider(PrismaService).useValue(prisma);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}
