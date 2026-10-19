import './fixed-env';
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { GLOBAL_PREFIX, createOpenApiDocument } from '../app.setup';

/**
 * Writes the OpenAPI document to the file given as the first argument (`pnpm gen:api`).
 * Needs no database and no .env: Prisma connects lazily and the environment is fixed
 * (fixed-env.ts), so the generated web client types do not depend on the local setup.
 */
async function exportOpenApi(outFile: string): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.setGlobalPrefix(GLOBAL_PREFIX);
  writeFileSync(outFile, `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`);
  await app.close();
}

const outFile = process.argv[2];
if (!outFile) {
  throw new Error('Usage: node dist-openapi/openapi/export-openapi.js <out.json>');
}
void exportOpenApi(outFile);
