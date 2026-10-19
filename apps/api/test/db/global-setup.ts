import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { POSTGRES_IMAGE, TEMPLATE_DATABASE } from './constants';
import { withAdminClient } from './admin-client';

declare global {
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * One PostgreSQL container per `test:e2e` run. Migrations are applied once through the
 * Prisma CLI (the same path as production), then the result is copied into a template
 * database that each test file clones (test/db/test-database.ts).
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('lowisko')
    .withUsername('lowisko')
    .withPassword('lowisko')
    .start();
  globalThis.__POSTGRES_CONTAINER__ = container;

  try {
    const url = container.getConnectionUri();
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });

    await withAdminClient(url, (admin) =>
      admin.$executeRawUnsafe(`CREATE DATABASE "${TEMPLATE_DATABASE}" TEMPLATE "lowisko"`),
    );

    // Workers are started after global setup and inherit these variables. The shared
    // database is deliberately unreachable: a test that needs the database clones its own
    // with createTestDatabase(), so one that forgets fails instead of sharing rows.
    const unusable = new URL(url);
    unusable.pathname = '/use_createTestDatabase';
    process.env.DATABASE_URL = unusable.toString();
    process.env.TEST_DATABASE_ADMIN_URL = url;
  } catch (error) {
    await container.stop();
    throw error;
  }
}
