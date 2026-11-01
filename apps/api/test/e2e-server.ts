import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { POSTGRES_IMAGE } from './db/constants';

/**
 * The API of a Playwright run (`pnpm e2e`, apps/web/playwright.config.ts): a throwaway
 * PostgreSQL container, migrations and seed through the Prisma CLI as in production, demo
 * data (SEED_DEMO), then the built API (`nest build` runs first, see `e2e:server`). The rest of
 * the environment comes from the Playwright config; nothing touches the development database.
 * SIGTERM from Playwright stops the API and the container; if the process is killed instead,
 * the Testcontainers reaper removes the container.
 */
async function main(): Promise<void> {
  const apiRoot = path.join(__dirname, '..');
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('lowisko')
    .withUsername('lowisko')
    .withPassword('lowisko')
    .start();
  const env = { ...process.env, DATABASE_URL: container.getConnectionUri() };

  const shutdown = async (code: number): Promise<never> => {
    await container.stop();
    process.exit(code);
  };

  try {
    const prisma = (...args: string[]) =>
      execFileSync('pnpm', ['exec', 'prisma', ...args], {
        cwd: apiRoot,
        env: { ...env, SEED_DEMO: 'true' },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
    prisma('migrate', 'deploy');
    prisma('db', 'seed');
  } catch (error) {
    console.error(error);
    return shutdown(1);
  }

  const api = spawn(process.execPath, ['dist/main.js'], { cwd: apiRoot, env, stdio: 'inherit' });
  api.on('exit', (code) => void shutdown(code ?? 1));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      api.removeAllListeners('exit');
      api.once('exit', () => void shutdown(0));
      api.kill('SIGTERM');
    });
  }
}

void main();
