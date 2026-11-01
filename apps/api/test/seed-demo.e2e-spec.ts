import { PasswordHasher } from '../src/modules/auth/password-hasher';
import {
  DEMO_CATCHES,
  DEMO_ORGANIZATIONS,
  DEMO_PERMIT_TYPES,
  DEMO_USERS,
  DEMO_WATERS,
} from '../prisma/demo-data';
import { seedDemoData } from '../prisma/seed-demo';
import { seedReferenceData } from '../prisma/seed-reference';
import { createTestDatabase, type TestDatabase } from './db/test-database';

const PASSWORD = 'demo-password-1';
// Outside the closed season of pike (01-01…04-30): only the regulamin rules reject.
const OCTOBER = new Date('2026-10-15T10:00:00.000Z');
// Inside it.
const FEBRUARY = new Date('2027-02-20T10:00:00.000Z');

const demoCatch = (latinName: string, lengthCm: number) => {
  const fish = DEMO_CATCHES.find(
    (candidate) => candidate.latinName === latinName && candidate.lengthCm === lengthCm,
  );
  if (!fish) throw new Error(`No demo catch ${latinName} ${lengthCm} cm`);
  return fish.clientId;
};

describe('seedDemoData', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await seedReferenceData(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  const seed = (now = OCTOBER, password = PASSWORD) => seedDemoData(db.prisma, { password, now });

  it('connects every demo water to its active organization', async () => {
    await seed();

    const organizations = await db.prisma.organization.findMany({
      include: { waters: true, memberships: { include: { user: true } } },
      orderBy: { nip: 'asc' },
    });
    expect(organizations.map((org) => [org.name, org.status])).toEqual(
      DEMO_ORGANIZATIONS.map((org) => [org.name, 'ACTIVE']),
    );
    const [sielawa, lipowy] = organizations;
    expect(sielawa?.waters.map((water) => water.name).sort()).toEqual([
      'Jezioro Srebrne',
      'Starorzecze Narwi',
    ]);
    expect(lipowy?.waters.map((water) => water.name)).toEqual(['Staw Lipowy']);
    expect(await db.prisma.fishingWater.count({ where: { status: 'CONNECTED' } })).toBe(
      DEMO_WATERS.length,
    );
    expect(sielawa?.memberships.map(({ user, role }) => [user.email, role]).sort()).toEqual([
      ['admin.sielawa@lowisko.test', 'ORG_ADMIN'],
      ['straznik@lowisko.test', 'INSPECTOR'],
    ]);
    expect(lipowy?.memberships.map(({ user, role }) => [user.email, role])).toEqual([
      ['admin.lipowy@lowisko.test', 'ORG_ADMIN'],
    ]);
  });

  it('puts the permit types on sale on the waters of their organization', async () => {
    await seed();

    const types = await db.prisma.permitType.findMany({
      include: { waters: true, organization: true },
    });
    expect(types).toHaveLength(DEMO_PERMIT_TYPES.length);
    for (const type of types) {
      expect(type.isActive).toBe(true);
      expect(type.waters.length).toBeGreaterThan(0);
      expect(type.waters.every((water) => water.organizationId === type.organizationId)).toBe(true);
    }
  });

  it('adds one regulamin rule at the organization level and one per water level', async () => {
    await seed();

    const rules = await db.prisma.speciesRule.findMany({
      where: { OR: [{ organizationId: { not: null } }, { fishingWaterId: { not: null } }] },
      include: { species: true, organization: true, water: true },
    });
    expect(
      rules
        .map((rule) => [
          rule.species.latinName,
          rule.water?.name ?? rule.organization?.name,
          rule.minLengthCm,
          rule.dailyLimitCount,
          rule.dailyLimitWeightG,
        ])
        .sort(),
    ).toEqual(
      [
        ['Cyprinus carpio', 'Koło PZW „Sielawa” (demo)', 35, 2, null],
        ['Cyprinus carpio', 'Staw Lipowy', 40, null, 5000],
        ['Esox lucius', 'Jezioro Srebrne', 50, null, null],
      ].sort(),
    );
  });

  it('verifies every account and gives it the demo password', async () => {
    await seed();

    const users = await db.prisma.user.findMany();
    expect(users.map((user) => user.email).sort()).toEqual(
      DEMO_USERS.map((user) => user.email).sort(),
    );
    const hasher = new PasswordHasher();
    for (const user of users) {
      expect(user.emailVerifiedAt).not.toBeNull();
      await expect(hasher.verify(user.passwordHash, PASSWORD)).resolves.toBe(true);
    }
    expect(users.filter((user) => user.isSuperAdmin).map((user) => user.email)).toEqual([
      'superadmin@lowisko.test',
    ]);
  });

  it('dates the permits back from the Warsaw day of the run and pays them with FAKE', async () => {
    await seed();

    const permits = await db.prisma.permit.findMany({
      include: { payments: true, permitType: true, user: true },
      orderBy: { validFrom: 'asc' },
    });
    expect(
      permits.map((permit) => ({
        holder: permit.user.email,
        type: permit.permitType.name,
        validFrom: permit.validFrom.toISOString().slice(0, 10),
        validTo: permit.validTo.toISOString().slice(0, 10),
        status: permit.status,
        payments: permit.payments.map(({ provider, status, amountGrosze }) => ({
          provider,
          status,
          amountGrosze,
        })),
      })),
    ).toEqual([
      {
        holder: 'jan.kowalski@lowisko.test',
        type: 'Dzienne',
        validFrom: '2026-09-05',
        validTo: '2026-09-05',
        status: 'PAID',
        payments: [{ provider: 'FAKE', status: 'SUCCEEDED', amountGrosze: 4000 }],
      },
      {
        holder: 'jan.kowalski@lowisko.test',
        type: 'Roczne',
        validFrom: '2026-09-15',
        validTo: '2027-09-14',
        status: 'PAID',
        payments: [{ provider: 'FAKE', status: 'SUCCEEDED', amountGrosze: 30000 }],
      },
    ]);
    // From the sequence of the year, so later purchases continue the numbering.
    expect(permits.map((permit) => permit.number).sort()).toEqual([
      'ZW-2026-000001',
      'ZW-2026-000002',
    ]);
  });

  it('gives every catch the verdict of the CatchValidator', async () => {
    await seed();

    const catches = await db.prisma.catchRecord.findMany();
    expect(catches).toHaveLength(DEMO_CATCHES.length);
    const rejected = catches.filter((fish) => fish.syncStatus === 'REJECTED');
    expect(rejected.map((fish) => [fish.clientId, fish.violations]).sort()).toEqual(
      [
        // The water rule of Jezioro Srebrne, stricter than the general 45 cm.
        [
          demoCatch('Esox lucius', 48),
          [{ code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } }],
        ],
        // The third kept carp of the day over the organization's limit of 2.
        [
          demoCatch('Cyprinus carpio', 47),
          [{ code: 'DAILY_COUNT_LIMIT', ruleId: 'BR-04', details: { limit: 2, alreadyKept: 2 } }],
        ],
      ].sort(),
    );
    expect(catches.every((fish) => fish.userId === catches[0]?.userId)).toBe(true);
  });

  it('rejects a kept pike in the closed season when the seed runs in it', async () => {
    await seed(FEBRUARY);

    const pike = await db.prisma.catchRecord.findUniqueOrThrow({
      where: { clientId: demoCatch('Esox lucius', 62) },
    });
    expect(pike).toMatchObject({
      syncStatus: 'REJECTED',
      violations: [
        { code: 'CLOSED_SEASON', ruleId: 'BR-03', details: { from: '01-01', to: '04-30' } },
      ],
    });
  });

  it('records the inspection protocol for the organization of the permit', async () => {
    await seed();

    const inspection = await db.prisma.inspection.findFirstOrThrow({
      include: { inspector: true, organization: true, permit: { include: { permitType: true } } },
    });
    expect(inspection).toMatchObject({
      result: 'VIOLATION',
      inspector: { email: 'straznik@lowisko.test' },
      organization: { name: 'Koło PZW „Sielawa” (demo)' },
      permit: { permitType: { name: 'Roczne' } },
      performedAt: new Date('2026-10-12T07:40:00.000Z'),
    });
  });

  it('is idempotent: a second run resets the password and restores the setup only', async () => {
    await seed();
    const snapshot = async () => ({
      organizations: await db.prisma.organization.count(),
      waters: await db.prisma.fishingWater.count(),
      users: await db.prisma.user.count(),
      memberships: await db.prisma.membership.count(),
      types: await db.prisma.permitType.count(),
      rules: await db.prisma.speciesRule.count(),
      permits: await db.prisma.permit.findMany({
        select: { id: true, number: true, validFrom: true },
        orderBy: { id: 'asc' },
      }),
      payments: await db.prisma.payment.count(),
      catches: await db.prisma.catchRecord.findMany({
        select: { clientId: true, caughtAt: true, syncStatus: true },
        orderBy: { clientId: 'asc' },
      }),
      inspections: await db.prisma.inspection.count(),
    });
    const first = await snapshot();
    await db.prisma.organization.updateMany({ data: { status: 'BLOCKED' } });

    await seed(new Date('2026-10-20T10:00:00.000Z'), 'another-password');

    expect(await snapshot()).toEqual(first);
    expect(await db.prisma.organization.count({ where: { status: 'ACTIVE' } })).toBe(
      DEMO_ORGANIZATIONS.length,
    );
    const jan = await db.prisma.user.findUniqueOrThrow({
      where: { email: 'jan.kowalski@lowisko.test' },
    });
    await expect(new PasswordHasher().verify(jan.passwordHash, 'another-password')).resolves.toBe(
      true,
    );
  });

  it.each([['short'], ['']])(
    'refuses the password %p before writing anything',
    async (password) => {
      await expect(seed(OCTOBER, password)).rejects.toThrow('SEED_DEMO_PASSWORD');

      expect(await db.prisma.organization.count()).toBe(0);
      expect(await db.prisma.user.count()).toBe(0);
    },
  );
});
