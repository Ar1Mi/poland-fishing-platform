import type { PrismaClient } from '../src/generated/prisma/client';

/**
 * Resolves once `count` queries of the test database wait for a lock: the requests under test
 * have reached the row a test transaction holds. A test of a lock fails without it (mutation
 * check).
 */
export async function untilSomeQueryWaitsForLock(prisma: PrismaClient, count = 1): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS "waiting" FROM pg_stat_activity
      WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
    if (row && row.waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('No query waited for the lock');
}
