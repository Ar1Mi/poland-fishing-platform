import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { ClockService } from '../src/common/clock/clock.service';
import { PrismaService } from '../src/database/prisma.service';
import { MAIL_TRANSPORT } from '../src/modules/notifications/mail-transport';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../src/modules/permits/payments/payment-provider';
import { GEOCODER } from '../src/modules/waters/import/geocoder';
import { FakeGeocoder } from './geocoding/fake-geocoder';
import { FakeMailTransport } from './mail/fake-mail-transport';

export const FIXED_NOW = new Date('2026-10-06T15:20:00.000Z');

export interface TestAppOptions extends Pick<ModuleMetadata, 'controllers' | 'imports'> {
  /** Test database (createTestDatabase + prismaServiceFor); without it nothing may query. */
  prisma?: PrismaService;
  /** Defaults to FIXED_NOW; a function lets a test move time forward. */
  now?: () => Date;
  mail?: FakeMailTransport;
  /** Nominatim is never called from tests; the default fake knows no places. */
  geocoder?: FakeGeocoder;
  /** Replaces the configured provider (PAYMENTS_PROVIDER=fake), e.g. one that fails or counts calls. */
  paymentProvider?: PaymentProvider;
}

/**
 * The real application with a fixed clock, a fake mail transport and a fake geocoder; `controllers` adds
 * test-only routes, `imports` the modules their guards come from.
 */
export async function createTestApp({
  controllers,
  imports = [],
  prisma,
  now = () => FIXED_NOW,
  mail = new FakeMailTransport(),
  geocoder = new FakeGeocoder(),
  paymentProvider,
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule, ...imports], controllers })
    .overrideProvider(ClockService)
    .useValue({ now })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mail)
    .overrideProvider(GEOCODER)
    .useValue(geocoder);
  if (prisma) {
    builder = builder.overrideProvider(PrismaService).useValue(prisma);
  }
  if (paymentProvider) {
    builder = builder.overrideProvider(PAYMENT_PROVIDER).useValue(paymentProvider);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}
