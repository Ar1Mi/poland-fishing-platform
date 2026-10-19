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

  // Typed independently of reference-data.ts from Dz.U. 2023 poz. 1373 (§ 6.1, § 7.1, § 2.3),
  // strictest variant where the regulation differs by river section.
  it.each([
    ['Esox lucius', 45, '01-01', '04-30', null],
    ['Sander lucioperca', 45, '03-01', '05-31', null],
    ['Silurus glanis', 70, '01-01', '05-31', null],
    ['Leuciscus aspius', 40, null, null, null],
    ['Barbus barbus', 40, '01-01', '06-30', null],
    ['Tinca tinca', 25, null, null, null],
    ['Leuciscus idus', 25, null, null, null],
    ['Squalius cephalus', 25, null, null, null],
    ['Scardinius erythrophthalmus', 15, null, null, null],
    ['Anguilla anguilla', 50, '12-01', '03-31', 2],
    ['Salmo trutta m. fario', 30, '09-01', '01-31', null],
    ['Thymallus thymallus', 30, '03-01', '05-31', null],
    ['Salmo trutta m. trutta', 35, '10-01', '02-28', null],
    ['Salmo salar', 35, '10-01', '02-28', null],
    ['Lota lota', 30, '12-01', '02-28', null],
    ['Acipenser oxyrinchus', null, '01-01', '12-31', null],
  ])(
    'stores the general rule of %s from the regulation',
    async (latinName, minLengthCm, closedFrom, closedTo, dailyLimitCount) => {
      await seedReferenceData(db.prisma);

      const rule = await db.prisma.speciesRule.findFirstOrThrow({
        where: { species: { latinName }, organizationId: null, fishingWaterId: null },
      });
      expect(rule).toMatchObject({
        minLengthCm,
        closedFrom,
        closedTo,
        dailyLimitCount,
        dailyLimitWeightG: null,
      });
    },
  );

  it.each(['Perca fluviatilis', 'Cyprinus carpio', 'Abramis brama', 'Rutilus rutilus'])(
    'leaves %s without a general rule',
    async (latinName) => {
      await seedReferenceData(db.prisma);

      expect(await db.prisma.speciesRule.count({ where: { species: { latinName } } })).toBe(0);
    },
  );

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
