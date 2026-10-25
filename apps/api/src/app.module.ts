import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ClockModule } from './common/clock/clock.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingModule } from './common/logging/logging.module';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { StorageModule } from './common/storage/storage.module';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { RulesModule } from './modules/rules/rules.module';
import { UsersModule } from './modules/users/users.module';
import { WatersModule } from './modules/waters/waters.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // The single .env lives in the repository root; scripts run from apps/api.
      envFilePath: ['.env', '../../.env'],
      // Tests and the OpenAPI export (src/openapi) run with a fixed environment.
      ignoreEnvFile: process.env.NODE_ENV === 'test' || process.env.OPENAPI_EXPORT === '1',
    }),
    LoggingModule,
    ClockModule,
    DatabaseModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WatersModule,
    RulesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
