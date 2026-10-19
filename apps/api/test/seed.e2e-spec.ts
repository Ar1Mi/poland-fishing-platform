import { seedReferenceData } from '../prisma/seed-reference';
import { SPECIES } from '../prisma/reference-data';
import { createTestDatabase, type TestDatabase } from './db/test-database';

describe('seedReferenceData', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  const speciesWithRules = SPECIES.filter((species) => species.rule).length;

  it('creates every species and one general rule per regulated species', async () => {
    await seedReferenceData(db.prisma);

    expect(await db.prisma.species.count()).toBe(SPECIES.length);
    expect(SPECIES.length).toBeGreaterThanOrEqual(15);
    expect(
      await db.prisma.speciesRule.count({ where: { organizationId: null, fishingWaterId: null } }),
    ).toBe(speciesWithRules);
    expect(await db.prisma.speciesRule.count()).toBe(speciesWithRules);
  });

  it('is idempotent and restores edited values on a second run', async () => {
    await seedReferenceData(db.prisma);
    const pike = await db.prisma.species.findUniqueOrThrow({ where: { latinName: 'Esox lucius' } });
    await db.prisma.speciesRule.updateMany({
      where: { speciesId: pike.id },
      data: { minLengthCm: 10, closedFrom: null, closedTo: null },
    });
    await db.prisma.species.update({ where: { id: pike.id }, data: { namePl: 'x' } });

    await seedReferenceData(db.prisma);

    expect(await db.prisma.species.count()).toBe(SPECIES.length);
    expect(await db.prisma.speciesRule.count()).toBe(speciesWithRules);
    const rule = await db.prisma.speciesRule.findFirstOrThrow({
      where: { speciesId: pike.id },
      include: { species: true },
    });
    expect(rule).toMatchObject({
      minLengthCm: 45,
      closedFrom: '01-01',
      closedTo: '04-30',
      species: { namePl: 'Szczupak' },
    });
  });

  it('marks the protected species and closes it all year', async () => {
    await seedReferenceData(db.prisma);

    const protectedSpecies = await db.prisma.species.findMany({
      where: { isProtected: true },
      include: { rules: true },
    });
    expect(protectedSpecies.map((species) => species.latinName)).toEqual(['Acipenser oxyrinchus']);
    expect(protectedSpecies[0]?.rules[0]).toMatchObject({ closedFrom: '01-01', closedTo: '12-31' });
  });

  it('keeps names in all three locales', async () => {
    await seedReferenceData(db.prisma);

    const blank = await db.prisma.species.count({
      where: { OR: [{ namePl: '' }, { nameEn: '' }, { nameRu: '' }] },
    });
    expect(blank).toBe(0);
  });
});
