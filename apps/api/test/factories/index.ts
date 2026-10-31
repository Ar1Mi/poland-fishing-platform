import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client';

// Minimal valid rows; each test overrides only the fields it is about.
// Unique fields get a random suffix so factories can be called repeatedly.

const unique = (): string => randomUUID().slice(0, 8);

export function createUser(
  prisma: PrismaClient,
  data: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  return prisma.user.create({
    data: {
      email: `angler-${unique()}@example.test`,
      passwordHash: 'not-a-real-hash',
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: new Date('1990-05-01'),
      ...data,
    },
  });
}

export function createOrganization(
  prisma: PrismaClient,
  data: Partial<Prisma.OrganizationUncheckedCreateInput> = {},
) {
  return prisma.organization.create({
    data: {
      name: `Koło PZW ${unique()}`,
      nip: String(Math.floor(Math.random() * 1e10)).padStart(10, '0'),
      kind: 'PZW',
      contactEmail: `kolo-${unique()}@example.test`,
      ...data,
    },
  });
}

export function createWater(
  prisma: PrismaClient,
  data: Partial<Prisma.FishingWaterUncheckedCreateInput> = {},
) {
  return prisma.fishingWater.create({
    data: {
      name: `Jezioro ${unique()}`,
      type: 'LAKE',
      region: 'mazowieckie',
      source: 'MANUAL',
      sourceRef: unique(),
      ...data,
    },
  });
}

export function createSpecies(
  prisma: PrismaClient,
  data: Partial<Prisma.SpeciesUncheckedCreateInput> = {},
) {
  return prisma.species.create({
    data: {
      latinName: `Testus ${unique()}`,
      namePl: 'Ryba',
      nameEn: 'Fish',
      nameRu: 'Рыба',
      ...data,
    },
  });
}

export async function createPermitType(
  prisma: PrismaClient,
  data: Partial<Prisma.PermitTypeUncheckedCreateInput> = {},
) {
  const organizationId = data.organizationId ?? (await createOrganization(prisma)).id;
  return prisma.permitType.create({
    data: { name: 'Dzienne', durationDays: 1, priceGrosze: 2500, ...data, organizationId },
  });
}

export async function createPermit(
  prisma: PrismaClient,
  data: Partial<Prisma.PermitUncheckedCreateInput> = {},
) {
  const userId = data.userId ?? (await createUser(prisma)).id;
  const permitTypeId = data.permitTypeId ?? (await createPermitType(prisma)).id;
  return prisma.permit.create({
    data: {
      number: `ZW-TEST-${unique()}`,
      validFrom: new Date('2026-10-06'),
      validTo: new Date('2026-10-06'),
      pricePaidGrosze: 2500,
      ...data,
      userId,
      permitTypeId,
    },
  });
}

export async function createExternalPermit(
  prisma: PrismaClient,
  data: Partial<Prisma.ExternalPermitUncheckedCreateInput> = {},
) {
  const userId = data.userId ?? (await createUser(prisma)).id;
  return prisma.externalPermit.create({
    data: {
      issuerName: 'Okręg PZW Warszawa',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      ...data,
      userId,
    },
  });
}

export async function createClaim(
  prisma: PrismaClient,
  data: Partial<Prisma.WaterClaimUncheckedCreateInput> = {},
) {
  const fishingWaterId = data.fishingWaterId ?? (await createWater(prisma)).id;
  const organizationId =
    data.organizationId ?? (await createOrganization(prisma, { status: 'ACTIVE' })).id;
  return prisma.waterClaim.create({
    data: {
      proofFileKey: `claims/${randomUUID()}.pdf`,
      ...data,
      fishingWaterId,
      organizationId,
    },
  });
}

/** An accepted kept catch; `userId`, a permit, `fishingWaterId` and `speciesId` are the test's. */
export function createCatch(
  prisma: PrismaClient,
  data: Pick<Prisma.CatchRecordUncheckedCreateInput, 'userId' | 'fishingWaterId' | 'speciesId'> &
    Partial<Prisma.CatchRecordUncheckedCreateInput>,
) {
  return prisma.catchRecord.create({
    data: {
      clientId: randomUUID(),
      caughtAt: new Date('2026-10-06T08:00:00.000Z'),
      lengthCm: 30,
      weightG: 500,
      kept: true,
      syncStatus: 'ACCEPTED',
      ...data,
    },
  });
}
