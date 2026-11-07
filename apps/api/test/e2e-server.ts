import { type ChildProcess, execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { POSTGRES_IMAGE } from './db/constants';

/** The version of docker-compose.yml. */
const MAILPIT_IMAGE = 'axllent/mailpit:v1.31';

const run = promisify(execFile);

/**
 * The API of a Playwright run (`pnpm e2e`, apps/web/playwright.config.ts): a throwaway
 * PostgreSQL container, migrations and seed through the Prisma CLI as in production, demo
 * data (SEED_DEMO), then the API built into `dist-e2e` (see `e2e:server`; `dist` belongs to
 * `pnpm dev`). A throwaway Mailpit catches the emails on the ports of the Playwright config
 * (`SMTP_URL`, `E2E_MAILPIT_URL`): scenario Д opens the links of the verification and invitation
 * emails. The rest of the environment comes from the Playwright config; nothing touches the
 * development database or mailbox. SIGTERM from Playwright stops the API and the container at any stage;
 * if the process is killed instead, the Testcontainers reaper removes the container.
 */
async function main(): Promise<void> {
  const apiRoot = path.join(__dirname, '..');
  let container: StartedPostgreSqlContainer | undefined;
  let mailpit: StartedTestContainer | undefined;
  let api: ChildProcess | undefined;
  let stopping = false;

  const shutdown = async (code: number): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (api && api.exitCode === null && api.signalCode === null) {
      const exited = new Promise((resolve) => api?.once('exit', resolve));
      api.kill('SIGTERM');
      await exited;
    }
    await Promise.all([container?.stop(), mailpit?.stop()]);
    process.exit(code);
  };
  // Before anything starts: Playwright may stop the run while the container is still starting.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(0));
  }

  try {
    const port = (url: string | undefined, name: string) => {
      const value = Number(url && new URL(url).port);
      if (!value) throw new Error(`${name} with a port comes from playwright.config.ts`);
      return value;
    };
    [container, mailpit] = await Promise.all([
      new PostgreSqlContainer(POSTGRES_IMAGE)
        .withDatabase('lowisko')
        .withUsername('lowisko')
        .withPassword('lowisko')
        .start(),
      new GenericContainer(MAILPIT_IMAGE)
        .withExposedPorts(
          { container: 1025, host: port(process.env.SMTP_URL, 'SMTP_URL') },
          { container: 8025, host: port(process.env.E2E_MAILPIT_URL, 'E2E_MAILPIT_URL') },
        )
        .withWaitStrategy(Wait.forListeningPorts())
        .start(),
    ]);
    const env = { ...process.env, DATABASE_URL: container.getConnectionUri() };
    const prisma = (...args: string[]) =>
      run('pnpm', ['exec', 'prisma', ...args], {
        cwd: apiRoot,
        env: { ...env, SEED_DEMO: 'true' },
      });
    await prisma('migrate', 'deploy');
    await prisma('db', 'seed');

    api = spawn(process.execPath, ['dist-e2e/main.js'], { cwd: apiRoot, env, stdio: 'inherit' });
    api.once('exit', (code) => void shutdown(code ?? 1));
  } catch (error) {
    // execFile keeps the output of a failed command on the error.
    console.error(error);
    await shutdown(1);
  }
}

void main();
