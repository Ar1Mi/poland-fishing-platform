// `pnpm --filter api import:waters data/waters/<file>.csv` — the same import as
// POST /admin/waters/import, without the HTTP timeout and the 1 MB upload limit.
// Runs under tsx, which emits no decorator metadata, so services are wired by hand
// instead of through Nest DI.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { envSchema } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { GeocodingService } from '../modules/waters/import/geocoding.service';
import { NominatimGeocoder } from '../modules/waters/import/nominatim-geocoder';
import { WaterImportService } from '../modules/waters/import/water-import.service';

/** A problem of the invocation or of the environment: printed without a stack trace. */
class CliError extends Error {}

const cliEnvSchema = envSchema.pick({
  DATABASE_URL: true,
  NOMINATIM_URL: true,
  NOMINATIM_USER_AGENT: true,
});

async function main(): Promise<void> {
  const [file] = process.argv.slice(2);
  if (!file) {
    throw new CliError('Usage: pnpm --filter api import:waters data/waters/<file>.csv');
  }
  // pnpm runs the script in apps/api; a relative path means the directory it was called from.
  const csvPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);

  // The single .env lives in the repository root (as for prisma.config.ts); the shell wins.
  const rootEnv = path.join(__dirname, '../../../.env');
  if (existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
  const parsed = cliEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new CliError(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (!env.NOMINATIM_USER_AGENT) {
    console.warn('NOMINATIM_USER_AGENT is not set: rows without lat/lng will fail.');
  }

  const prisma = new PrismaService(new ConfigService(env));
  try {
    const geocoder = new NominatimGeocoder({
      baseUrl: env.NOMINATIM_URL,
      userAgent: env.NOMINATIM_USER_AGENT,
    });
    const importer = new WaterImportService(prisma, new GeocodingService(prisma, geocoder));
    const report = await importer.import(readFileSync(csvPath));

    console.log(
      `${path.basename(csvPath)}: created ${report.created}, updated ${report.updated}, failed ${report.failed.length}`,
    );
    for (const { row, error } of report.failed) {
      console.log(`  row ${row}: ${error}`);
    }
    if (report.failed.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof DomainError) {
    console.error(`Import rejected: ${error.message}`);
  } else {
    console.error(error instanceof CliError ? error.message : error);
  }
  process.exitCode = 1;
});
