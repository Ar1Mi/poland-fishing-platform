import { ErrorCode } from '@lowisko/shared';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { ErrorResponseDto } from './common/errors/error-response.dto';
import { GLOBAL_PREFIX } from './common/http/global-prefix';
import { HTTP_LOGGER } from './common/logging/logging.module';
import type { Env } from './config/env';

export { GLOBAL_PREFIX };
export const SWAGGER_PATH = 'api/docs';

/** HTTP-level setup shared by `main.ts` and the integration tests. */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(GLOBAL_PREFIX);
  // Mounted before the body parser and the router: every response is logged, carries a
  // request id and security headers, even when the request never reaches a controller.
  app.use(app.get<HttpLogger>(HTTP_LOGGER));
  app.use(helmet());
  app.use(rejectUnknownPath);
  // The refresh token arrives as the `rt` cookie (POST /auth/refresh, /auth/logout).
  app.use(cookieParser());
  // Credentials: the refresh token travels in an httpOnly cookie (docs/05-api.md).
  app.enableCors({ origin: config.get('WEB_URL', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  SwaggerModule.setup(SWAGGER_PATH, app, createOpenApiDocument(app));
}

/** OpenAPI document served on `/api/docs-json`; also exported for the web client (`pnpm gen:api`). */
export function createOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Łowisko API')
      .setVersion('1')
      .addServer(config.get('API_URL', { infer: true }))
      .addBearerAuth()
      .addCookieAuth('rt')
      .build(),
    { extraModels: [ErrorResponseDto] },
  );
}

/** Express would answer a path outside the API and Swagger with an HTML page; keep the JSON format. */
function rejectUnknownPath(req: Request, res: Response, next: NextFunction): void {
  const known = [GLOBAL_PREFIX, SWAGGER_PATH, `${SWAGGER_PATH}-json`].some(
    (root) => req.path === `/${root}` || req.path.startsWith(`/${root}/`),
  );
  if (known) {
    next();
    return;
  }
  res.status(404).json({ code: ErrorCode.NOT_FOUND, message: `Cannot ${req.method} ${req.path}` });
}
