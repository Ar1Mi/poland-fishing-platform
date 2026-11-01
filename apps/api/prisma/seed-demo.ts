import {
  addDays,
  type CatchContext,
  type DateOnly,
  fromWarsawDateTimeLocal,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  permitValidTo,
  resolveEffectiveRule,
  type SameDayCatch,
  validateCatch,
  warsawDate,
} from '@lowisko/shared';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PasswordHasher } from '../src/modules/auth/password-hasher';
import { fromDbDate, toDbDate } from '../src/modules/permits/permit-dates';
import {
  DEMO_CATCHES,
  DEMO_INSPECTION,
  DEMO_ORGANIZATIONS,
  DEMO_PERMIT_TYPES,
  DEMO_PERMITS,
  DEMO_RULES,
  DEMO_USERS,
  DEMO_WATER_DESCRIPTION,
  DEMO_WATERS,
} from './demo-data';

type Tx = Prisma.TransactionClient;

export interface DemoSeedOptions {
  /** SEED_DEMO_PASSWORD: every demo account gets it on each run. */
  password: string;
  /** The moment of the run; permits and catches are dated back from its Warsaw day. */
  now: Date;
}

/** The demo password follows the registration rules, so the login form accepts it. */
export function assertDemoPassword(password: string | undefined): asserts password is string {
  if (
    password === undefined ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `SEED_DEMO_PASSWORD must be set to ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters with SEED_DEMO=true`,
    );
  }
}

/**
 * Idempotent like the reference data: accounts, organizations, waters, permit types and rules
 * are upserted to the values of demo-data.ts; permits, catches and the inspection protocol are
 * created once (fixed ids) and then left as the app changed them. Needs seedReferenceData first.
 */
export async function seedDemoData(prisma: PrismaClient, options: DemoSeedOptions): Promise<void> {
  assertDemoPassword(options.password);
  // argon2 is slow on purpose: hashed before the transaction holds its locks.
  const passwordHash = await new PasswordHasher().hash(options.password);
  const today = warsawDate(options.now);

  await prisma.$transaction(
    async (tx) => {
      const orgIds = await seedOrganizations(tx);
      const waterIds = await seedWaters(tx, orgIds);
      const userIds = await seedUsers(tx, orgIds, passwordHash, options.now);
      await seedPermitTypes(tx, orgIds, waterIds);
      await seedRules(tx, orgIds, waterIds);
      await seedPermits(tx, userIds, today);
      await seedCatches(tx, userIds, waterIds, today, options.now);
      await seedInspection(tx, userIds, today);
    },
    // Dozens of sequential statements; the default 5 s is tight on a cold CI database.
    { timeout: 30_000 },
  );
}

const byKey = <K extends string>(entries: [K, string][]): Record<K, string> =>
  Object.fromEntries(entries) as Record<K, string>;

async function seedOrganizations(tx: Tx) {
  const rows: [(typeof DEMO_ORGANIZATIONS)[number]['key'], string][] = [];
  for (const { key, ...org } of DEMO_ORGANIZATIONS) {
    const data = { ...org, status: 'ACTIVE' as const };
    const { id } = await tx.organization.upsert({
      where: { nip: org.nip },
      create: data,
      update: data,
    });
    rows.push([key, id]);
  }
  return byKey(rows);
}

async function seedWaters(tx: Tx, orgIds: Record<string, string>) {
  const rows: [(typeof DEMO_WATERS)[number]['key'], string][] = [];
  for (const { key, organization, sourceRef, ...water } of DEMO_WATERS) {
    const data = {
      ...water,
      region: 'mazowieckie',
      description: DEMO_WATER_DESCRIPTION,
      status: 'CONNECTED' as const,
      organizationId: orgIds[organization],
      isPublished: true,
    };
    const { id } = await tx.fishingWater.upsert({
      where: { source_sourceRef: { source: 'MANUAL', sourceRef } },
      create: { ...data, source: 'MANUAL', sourceRef },
      update: data,
    });
    rows.push([key, id]);
  }
  return byKey(rows);
}

async function seedUsers(tx: Tx, orgIds: Record<string, string>, passwordHash: string, now: Date) {
  const rows: [(typeof DEMO_USERS)[number]['key'], string][] = [];
  for (const { key, memberships = [], birthDate, ...user } of DEMO_USERS) {
    const data = {
      ...user,
      anglerCardNo: user.anglerCardNo ?? null,
      isSuperAdmin: user.isSuperAdmin ?? false,
      birthDate: toDbDate(birthDate),
      passwordHash,
      locale: 'pl' as const,
    };
    const { id, emailVerifiedAt } = await tx.user.upsert({
      where: { email: user.email },
      create: { ...data, emailVerifiedAt: now },
      update: data,
    });
    if (!emailVerifiedAt) {
      await tx.user.update({ where: { id }, data: { emailVerifiedAt: now } });
    }
    for (const { organization, role } of memberships) {
      const organizationId = orgIds[organization]!;
      await tx.membership.upsert({
        where: { userId_organizationId_role: { userId: id, organizationId, role } },
        create: { userId: id, organizationId, role },
        update: {},
      });
    }
    rows.push([key, id]);
  }
  return byKey(rows);
}

async function seedPermitTypes(
  tx: Tx,
  orgIds: Record<string, string>,
  waterIds: Record<string, string>,
) {
  for (const type of DEMO_PERMIT_TYPES) {
    const data = {
      name: type.name,
      durationDays: type.durationDays,
      priceGrosze: type.priceGrosze,
      discountKind: type.discountKind,
      organizationId: orgIds[type.organization]!,
      isActive: true,
    };
    const connect = type.waters.map((water) => ({ id: waterIds[water]! }));
    await tx.permitType.upsert({
      where: { id: type.id },
      create: { ...data, id: type.id, waters: { connect } },
      update: { ...data, waters: { set: connect } },
    });
  }
}

async function seedRules(tx: Tx, orgIds: Record<string, string>, waterIds: Record<string, string>) {
  for (const { latinName, organization, water, ...values } of DEMO_RULES) {
    const { id: speciesId } = await tx.species.findUniqueOrThrow({ where: { latinName } });
    const level = {
      speciesId,
      organizationId: orgIds[organization]!,
      fishingWaterId: water ? waterIds[water]! : null,
    };
    const parameters = {
      minLengthCm: values.minLengthCm ?? null,
      closedFrom: null,
      closedTo: null,
      dailyLimitCount: values.dailyLimitCount ?? null,
      dailyLimitWeightG: values.dailyLimitWeightG ?? null,
    };
    const existing = await tx.speciesRule.findFirst({ where: level });
    if (existing) {
      await tx.speciesRule.update({ where: { id: existing.id }, data: parameters });
    } else {
      await tx.speciesRule.create({ data: { ...level, ...parameters } });
    }
  }
}

async function seedPermits(tx: Tx, userIds: Record<string, string>, today: DateOnly) {
  for (const permit of DEMO_PERMITS) {
    if (await tx.permit.findUnique({ where: { id: permit.id } })) {
      continue;
    }
    const type = DEMO_PERMIT_TYPES.find((candidate) => candidate.key === permit.type)!;
    const validFrom = addDays(today, -permit.startsDaysAgo);
    // Bought on its first day, at noon: the number belongs to that year.
    const boughtAt = fromWarsawDateTimeLocal(`${validFrom}T12:00`)!;
    // The sequence behind PermitNumberService (docs/04-data-model.md).
    const [{ number }] = await tx.$queryRaw<[{ number: string }]>`
      SELECT next_permit_number(${Number(validFrom.slice(0, 4))}::integer) AS number`;
    await tx.permit.create({
      data: {
        id: permit.id,
        number,
        userId: userIds[permit.holder]!,
        permitTypeId: type.id,
        validFrom: toDbDate(validFrom),
        validTo: toDbDate(permitValidTo(validFrom, type.durationDays)),
        status: 'PAID',
        pricePaidGrosze: type.priceGrosze,
        createdAt: boughtAt,
        payments: {
          create: {
            provider: 'FAKE',
            sessionId: permit.paymentSessionId,
            amountGrosze: type.priceGrosze,
            status: 'SUCCEEDED',
            createdAt: boughtAt,
          },
        },
      },
    });
  }
}

/**
 * Catches in the order of `caughtAt`, each checked like `POST /catches/sync` does it: the
 * effective rule of its water, and the catches already accepted for the daily limits.
 */
async function seedCatches(
  tx: Tx,
  userIds: Record<string, string>,
  waterIds: Record<string, string>,
  today: DateOnly,
  now: Date,
) {
  const catches = DEMO_CATCHES.map((fish) => ({
    ...fish,
    caughtAt: fromWarsawDateTimeLocal(`${addDays(today, -fish.daysAgo)}T${fish.time}`)!,
  })).sort((a, b) => a.caughtAt.getTime() - b.caughtAt.getTime());

  const [species, rules, permits, waters] = await Promise.all([
    tx.species.findMany({
      where: { latinName: { in: catches.map((fish) => fish.latinName) } },
    }),
    tx.speciesRule.findMany(),
    tx.permit.findMany({
      where: { id: { in: DEMO_PERMITS.map((permit) => permit.id) } },
      include: { permitType: { include: { waters: { select: { id: true } } } } },
    }),
    tx.fishingWater.findMany({ where: { id: { in: Object.values(waterIds) } } }),
  ]);
  const accepted: SameDayCatch[] = await tx.catchRecord.findMany({
    where: { userId: userIds.jan!, syncStatus: 'ACCEPTED', kept: true },
    select: { speciesId: true, caughtAt: true, weightG: true, kept: true },
  });

  for (const fish of catches) {
    if (await tx.catchRecord.findUnique({ where: { clientId: fish.clientId } })) {
      continue;
    }
    const { id: speciesId, isProtected } = species.find(
      (candidate) => candidate.latinName === fish.latinName,
    )!;
    const permit = permits.find((candidate) => candidate.id === fish.permit)!;
    const water = waters.find((candidate) => candidate.id === waterIds[fish.water])!;
    const input = {
      speciesId,
      fishingWaterId: water.id,
      caughtAt: fish.caughtAt,
      lengthCm: fish.lengthCm,
      weightG: fish.weightG,
      kept: fish.kept,
    };
    const context: CatchContext = {
      catch: input,
      permit: {
        kind: 'PLATFORM',
        status: permit.status,
        validFrom: fromDbDate(permit.validFrom),
        validTo: fromDbDate(permit.validTo),
        waterIds: permit.permitType.waters.map(({ id }) => id),
      },
      species: { id: speciesId, isProtected },
      // General, organization and water level of the catch's water (ADR-0008).
      effectiveRule: resolveEffectiveRule(
        rules.filter(
          (rule) =>
            rule.speciesId === speciesId &&
            (rule.fishingWaterId === water.id ||
              (rule.fishingWaterId === null &&
                (rule.organizationId === null || rule.organizationId === water.organizationId))),
        ),
      ),
      sameDayKept: accepted,
      now,
    };
    const violations = validateCatch(context);
    await tx.catchRecord.create({
      data: {
        ...input,
        clientId: fish.clientId,
        userId: userIds.jan!,
        permitId: permit.id,
        syncStatus: violations.length === 0 ? 'ACCEPTED' : 'REJECTED',
        violations:
          violations.length === 0 ? undefined : (violations as unknown as Prisma.InputJsonArray),
        createdAt: fish.caughtAt,
      },
    });
    if (violations.length === 0 && fish.kept) {
      accepted.push(input);
    }
  }
}

async function seedInspection(tx: Tx, userIds: Record<string, string>, today: DateOnly) {
  const { id, permit, inspector, daysAgo, time, ...protocol } = DEMO_INSPECTION;
  if (await tx.inspection.findUnique({ where: { id } })) {
    return;
  }
  const { permitType } = await tx.permit.findUniqueOrThrow({
    where: { id: permit },
    select: { permitType: { select: { organizationId: true } } },
  });
  await tx.inspection.create({
    data: {
      ...protocol,
      id,
      permitId: permit,
      inspectorId: userIds[inspector]!,
      organizationId: permitType.organizationId,
      performedAt: fromWarsawDateTimeLocal(`${addDays(today, -daysAgo)}T${time}`)!,
    },
  });
}
