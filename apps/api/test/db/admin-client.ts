import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

export function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Runs `fn` with a short-lived client for CREATE/DROP DATABASE statements. */
export async function withAdminClient<T>(
  connectionString: string,
  fn: (admin: PrismaClient) => Promise<T>,
): Promise<T> {
  const admin = createClient(connectionString);
  try {
    return await fn(admin);
  } finally {
    await admin.$disconnect();
  }
}
