import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { ClockService } from '../src/common/clock/clock.service';

export const FIXED_NOW = new Date('2026-10-06T15:20:00.000Z');

/** The real application with a fixed clock; `controllers` adds test-only routes. */
export async function createTestApp(
  extra: Pick<ModuleMetadata, 'controllers'> = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], ...extra })
    .overrideProvider(ClockService)
    .useValue({ now: () => FIXED_NOW })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}
