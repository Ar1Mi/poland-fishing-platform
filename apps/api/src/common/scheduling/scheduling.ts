import type { DynamicModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * Timed jobs (`@Cron`, `@Interval` from @nestjs/schedule) run in the API process, one module for
 * the whole application. Not under NODE_ENV=test: tests call a job's method themselves after
 * moving the clock, and a timer would race them. Not in the OpenAPI export either, which builds
 * the application only to describe it. Decided from the process environment when AppModule is
 * loaded, like `ignoreEnvFile`.
 */
export function schedulingImports(env: NodeJS.ProcessEnv = process.env): DynamicModule[] {
  return env.NODE_ENV === 'test' || env.OPENAPI_EXPORT === '1' ? [] : [ScheduleModule.forRoot()];
}
