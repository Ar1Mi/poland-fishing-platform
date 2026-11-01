// `pnpm --filter api prisma db seed`: species and general rules on every run; with
// SEED_DEMO=true also the demo organizations, waters and accounts (prisma/demo-data.ts), whose
// password is SEED_DEMO_PASSWORD.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertDemoPassword, seedDemoData } from './seed-demo';
import { seedReferenceData } from './seed-reference';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const demo = process.env.SEED_DEMO === 'true';
  const password = process.env.SEED_DEMO_PASSWORD;
  // Before any write: a demo run without its password must not leave half the data.
  if (demo) {
    assertDemoPassword(password);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await seedReferenceData(prisma);
    const [species, rules] = await Promise.all([
      prisma.species.count(),
      prisma.speciesRule.count(),
    ]);
    console.log(`Seeded ${species} species, ${rules} rules.`);

    if (demo) {
      await seedDemoData(prisma, { password: password!, now: new Date() });
      console.log('Seeded demo data (SEED_DEMO=true).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
