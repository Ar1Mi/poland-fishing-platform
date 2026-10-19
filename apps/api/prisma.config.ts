import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env itself. The single .env lives in the repository root
// (same as ConfigModule in app.module.ts); variables already set in the shell win.
const rootEnv = path.join(__dirname, '../../.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` (postinstall, CI) needs no database; migrate and seed commands do.
  ...(url ? { datasource: { url } } : {}),
});
