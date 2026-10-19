import type { PrismaClient } from '../src/generated/prisma/client';
import { SPECIES } from './reference-data';

/**
 * Idempotent: species are upserted by latin name, and each species keeps a single
 * general rule that is overwritten with the values from reference-data.ts.
 */
export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const { rule, ...species } of SPECIES) {
      const data = { ...species, isProtected: species.isProtected ?? false };
      const { id: speciesId } = await tx.species.upsert({
        where: { latinName: species.latinName },
        create: data,
        update: data,
      });

      const generalRule = {
        speciesId,
        organizationId: null,
        fishingWaterId: null,
      };
      const existing = await tx.speciesRule.findFirst({ where: generalRule });
      if (!rule) {
        if (existing) await tx.speciesRule.delete({ where: { id: existing.id } });
        continue;
      }

      const values = {
        minLengthCm: rule.minLengthCm ?? null,
        closedFrom: rule.closedFrom ?? null,
        closedTo: rule.closedTo ?? null,
        dailyLimitCount: rule.dailyLimitCount ?? null,
        dailyLimitWeightG: null,
      };
      if (existing) {
        await tx.speciesRule.update({ where: { id: existing.id }, data: values });
      } else {
        await tx.speciesRule.create({ data: { ...generalRule, ...values } });
      }
    }
  });
}
