import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { createClient, withAdminClient } from './admin-client';
import { TEMPLATE_DATABASE } from './constants';

export interface TestDatabase {
  url: string;
  prisma: PrismaClient;
  drop(): Promise<void>;
}

function adminUrl(): string {
  const url = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_ADMIN_URL is not set: run integration tests via `test:e2e`');
  }
  return url;
}

/**
 * A fresh migrated database for one test file, cloned from the template in a few
 * milliseconds. Test files run in parallel without seeing each other's rows.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = adminUrl();
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  await withAdminClient(admin, (client) =>
    client.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DATABASE}"`),
  );

  const url = new URL(admin);
  url.pathname = `/${name}`;
  const prisma = createClient(url.toString());

  return {
    url: url.toString(),
    prisma,
    async drop() {
      await prisma.$disconnect();
      await withAdminClient(admin, (client) =>
        client.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`),
      );
    },
  };
}
