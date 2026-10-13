import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Env } from './config/env';

export const GLOBAL_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

/** HTTP-level setup shared by `main.ts` and the integration tests. */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(helmet());
  // Credentials: the refresh token travels in an httpOnly cookie (docs/05-api.md).
  app.enableCors({ origin: config.get('WEB_URL', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Łowisko API')
      .setVersion('1')
      .addServer(config.get('API_URL', { infer: true }))
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
