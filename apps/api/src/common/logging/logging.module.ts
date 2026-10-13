import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { type HttpLogger, pinoHttp } from 'pino-http';
import type { Env } from '../../config/env';
import { buildLoggerOptions } from './logger.options';

export const HTTP_LOGGER = Symbol('HTTP_LOGGER');

/**
 * Owns the single pino-http instance. `setupApp` mounts it as the first Express middleware,
 * so requests rejected before routing (malformed body, unknown path) are logged and get a
 * request id too; nestjs-pino only binds the resulting `req.log` to its loggers.
 */
@Module({
  providers: [
    {
      provide: HTTP_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): HttpLogger =>
        pinoHttp(buildLoggerOptions(config.get('NODE_ENV', { infer: true }))),
    },
  ],
  exports: [HTTP_LOGGER],
})
class HttpLoggerModule {}

@Module({
  imports: [
    HttpLoggerModule,
    LoggerModule.forRootAsync({
      imports: [HttpLoggerModule],
      inject: [HTTP_LOGGER],
      useFactory: (httpLogger: HttpLogger) => ({
        pinoHttp: { logger: httpLogger.logger },
        useExisting: true as const,
      }),
    }),
  ],
  exports: [HttpLoggerModule, LoggerModule],
})
export class LoggingModule {}
