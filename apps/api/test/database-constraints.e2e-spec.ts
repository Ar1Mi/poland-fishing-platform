import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import {
  createExternalPermit,
  createOrganization,
  createPermit,
  createPermitType,
  createSpecies,
  createUser,
  createWater,
} from './factories';

// SQL constraints of the init migration (docs/04-data-model.md → «SQL-ограничения в миграциях»).
describe('database constraints', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await createTestDatabase();
    prisma = db.prisma;
  });

  afterAll(async () => {
    await db.drop();
  });

  describe('catch_exactly_one_permit', () => {
    async function catchData() {
      const user = await createUser(prisma);
      const water = await createWater(prisma);
      const species = await createSpecies(prisma);
      return {
        clientId: crypto.randomUUID(),
        userId: user.id,
        fishingWaterId: water.id,
        speciesId: species.id,
        caughtAt: new Date('2026-10-06T08:00:00Z'),
        lengthCm: 50,
        kept: false,
        syncStatus: 'ACCEPTED' as const,
      };
    }

    it('accepts a catch on a platform permit or on an external permit', async () => {
      const data = await catchData();
      const permit = await createPermit(prisma, { userId: data.userId });
      const external = await createExternalPermit(prisma, { userId: data.userId });

      await expect(
        prisma.catchRecord.create({ data: { ...data, permitId: permit.id } }),
      ).resolves.toBeDefined();
      await expect(
        prisma.catchRecord.create({
          data: { ...data, clientId: crypto.randomUUID(), externalPermitId: external.id },
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a catch without a permit', async () => {
      await expect(prisma.catchRecord.create({ data: await catchData() })).rejects.toThrow(
        /catch_exactly_one_permit/,
      );
    });

    it('refuses to delete an external permit that has catches', async () => {
      const data = await catchData();
      const external = await createExternalPermit(prisma, { userId: data.userId });
      await prisma.catchRecord.create({ data: { ...data, externalPermitId: external.id } });

      await expect(prisma.externalPermit.delete({ where: { id: external.id } })).rejects.toThrow(
        /CatchRecord_externalPermitId_fkey|Foreign key constraint/,
      );
      expect(await prisma.externalPermit.count({ where: { id: external.id } })).toBe(1);
    });

    it('rejects a catch on both kinds of permit at once', async () => {
      const data = await catchData();
      const permit = await createPermit(prisma, { userId: data.userId });
      const external = await createExternalPermit(prisma, { userId: data.userId });

      await expect(
        prisma.catchRecord.create({
          data: { ...data, permitId: permit.id, externalPermitId: external.id },
        }),
      ).rejects.toThrow(/catch_exactly_one_permit/);
    });
  });

  describe('SpeciesRule', () => {
    it('rejects a water-level rule without an organization', async () => {
      const species = await createSpecies(prisma);
      const water = await createWater(prisma);

      await expect(
        prisma.speciesRule.create({
          data: { speciesId: species.id, fishingWaterId: water.id, minLengthCm: 50 },
        }),
      ).rejects.toThrow(/rule_water_requires_org/);
    });

    it('accepts a closed period that crosses the new year', async () => {
      const species = await createSpecies(prisma);

      await expect(
        prisma.speciesRule.create({
          data: { speciesId: species.id, closedFrom: '12-01', closedTo: '02-28' },
        }),
      ).resolves.toBeDefined();
    });

    // The CHECK validates the MM-DD shape only: a day that does not exist in its month
    // (02-30) passes here and is left to input validation of the rules API (T-16).
    it.each([
      ['only the start', { closedFrom: '01-01' }],
      ['only the end', { closedTo: '04-30' }],
      ['month 13', { closedFrom: '13-01', closedTo: '04-30' }],
      ['day 32', { closedFrom: '01-01', closedTo: '01-32' }],
      ['a full date', { closedFrom: '2026-01-01', closedTo: '04-30' }],
      ['no leading zero', { closedFrom: '1-01', closedTo: '04-30' }],
    ])('rejects a closed period with %s', async (_case, period) => {
      const species = await createSpecies(prisma);

      await expect(
        prisma.speciesRule.create({ data: { speciesId: species.id, ...period } }),
      ).rejects.toThrow(/rule_closed_period/);
    });

    it('allows one general rule per species but several organization rules', async () => {
      const species = await createSpecies(prisma);
      const organization = await createOrganization(prisma);

      await prisma.speciesRule.create({ data: { speciesId: species.id, minLengthCm: 45 } });
      await expect(
        prisma.speciesRule.create({ data: { speciesId: species.id, minLengthCm: 50 } }),
      ).rejects.toThrow(/rule_one_general/);

      for (const minLengthCm of [50, 55]) {
        await expect(
          prisma.speciesRule.create({
            data: { speciesId: species.id, organizationId: organization.id, minLengthCm },
          }),
        ).resolves.toBeDefined();
      }
    });

    it('deletes organization and water rules with their level instead of widening them', async () => {
      const species = await createSpecies(prisma);
      const organization = await createOrganization(prisma);
      const water = await createWater(prisma);
      const orgRule = await prisma.speciesRule.create({
        data: { speciesId: species.id, organizationId: organization.id, minLengthCm: 50 },
      });
      const waterRule = await prisma.speciesRule.create({
        data: {
          speciesId: species.id,
          organizationId: organization.id,
          fishingWaterId: water.id,
          minLengthCm: 55,
        },
      });

      await prisma.fishingWater.delete({ where: { id: water.id } });
      expect(await prisma.speciesRule.findUnique({ where: { id: waterRule.id } })).toBeNull();
      expect(await prisma.speciesRule.findUnique({ where: { id: orgRule.id } })).not.toBeNull();

      await prisma.organization.delete({ where: { id: organization.id } });
      expect(await prisma.speciesRule.count({ where: { speciesId: species.id } })).toBe(0);
    });
  });

  describe('water_connected_has_org', () => {
    it('rejects a connected water without an organization', async () => {
      await expect(createWater(prisma, { status: 'CONNECTED' })).rejects.toThrow(
        /water_connected_has_org/,
      );
    });

    it('accepts a connected water with an organization', async () => {
      const organization = await createOrganization(prisma);

      await expect(
        createWater(prisma, { status: 'CONNECTED', organizationId: organization.id }),
      ).resolves.toBeDefined();
    });
  });

  describe('permits', () => {
    it('rejects a permit that ends before it starts', async () => {
      await expect(
        createPermit(prisma, {
          validFrom: new Date('2026-10-06'),
          validTo: new Date('2026-10-05'),
        }),
      ).rejects.toThrow(/permit_dates/);
    });

    it.each([
      ['zero days', { durationDays: 0 }],
      ['a negative price', { priceGrosze: -1 }],
    ])('rejects a permit type with %s', async (_case, data) => {
      await expect(createPermitType(prisma, data)).rejects.toThrow(/permit_type_positive/);
    });

    it('accepts a free permit type', async () => {
      await expect(createPermitType(prisma, { priceGrosze: 0 })).resolves.toBeDefined();
    });
  });

  describe('claim_one_pending', () => {
    it('allows one pending claim per water and organization, and new ones after a decision', async () => {
      const organization = await createOrganization(prisma);
      const water = await createWater(prisma);
      const claim = {
        fishingWaterId: water.id,
        organizationId: organization.id,
        proofFileKey: 'claims/proof.pdf',
      };

      const first = await prisma.waterClaim.create({ data: claim });
      await expect(prisma.waterClaim.create({ data: claim })).rejects.toThrow(/claim_one_pending/);

      await prisma.waterClaim.update({ where: { id: first.id }, data: { status: 'REJECTED' } });
      await expect(prisma.waterClaim.create({ data: claim })).resolves.toBeDefined();
    });

    it('allows pending claims of different organizations for the same water', async () => {
      const water = await createWater(prisma);
      const [a, b] = await Promise.all([createOrganization(prisma), createOrganization(prisma)]);

      for (const organization of [a, b]) {
        await expect(
          prisma.waterClaim.create({
            data: {
              fishingWaterId: water.id,
              organizationId: organization.id,
              proofFileKey: 'claims/proof.pdf',
            },
          }),
        ).resolves.toBeDefined();
      }
    });
  });
});
