// `pnpm --filter api prisma db seed`: species and general rules on every run.
// Demo organizations, waters and users (SEED_DEMO=true) need the auth and organization
// modules and are added in T-20.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedReferenceData } from './seed-reference';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await seedReferenceData(prisma);
    const [species, rules] = await Promise.all([
      prisma.species.count(),
      prisma.speciesRule.count(),
    ]);
    console.log(`Seeded ${species} species, ${rules} rules.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
