import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock/clock.service';
import { PermitNumberService } from '../src/database/permit-number.service';
import { PrismaService } from '../src/database/prisma.service';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';

describe('PermitNumberService', () => {
  let db: TestDatabase;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let numbers: PermitNumberService;
  let now: Date;

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    now = new Date('2026-10-06T12:00:00.000Z');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockService)
      .useValue({ now: () => now })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    numbers = moduleRef.get(PermitNumberService);
  });

  afterEach(async () => {
    await moduleRef.close();
    await prisma.$disconnect();
    await db.drop();
  });

  it('numbers permits of a year from ZW-YYYY-000001 upwards', async () => {
    expect(await numbers.next()).toBe('ZW-2026-000001');
    expect(await numbers.next()).toBe('ZW-2026-000002');
    expect(await numbers.next()).toBe('ZW-2026-000003');
  });

  it('restarts numbering at the new year in Europe/Warsaw, not in UTC', async () => {
    now = new Date('2026-12-31T22:59:59.000Z'); // 23:59:59 in Warsaw
    expect(await numbers.next()).toBe('ZW-2026-000001');
    expect(await numbers.next()).toBe('ZW-2026-000002');

    now = new Date('2026-12-31T23:00:00.000Z'); // 2027-01-01 00:00 in Warsaw
    expect(await numbers.next()).toBe('ZW-2027-000001');
  });

  it('keeps counting the old year after the new one has started', async () => {
    await numbers.next();
    now = new Date('2027-01-02T12:00:00.000Z');
    await numbers.next();

    now = new Date('2026-12-30T12:00:00.000Z');
    expect(await numbers.next()).toBe('ZW-2026-000002');
  });

  it('gives distinct numbers to concurrent first requests of a year', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => numbers.next()));

    expect(new Set(results).size).toBe(10);
    expect(results.toSorted()).toEqual(
      Array.from({ length: 10 }, (_, i) => `ZW-2026-${String(i + 1).padStart(6, '0')}`),
    );
  });

  /** Takes the first number of the year in a purchase transaction that stays open until `finish`. */
  function openPurchase(outcome: 'commit' | 'rollback') {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    let numbered!: (number: string) => void;
    const number = new Promise<string>((resolve) => (numbered = resolve));
    const done = prisma.$transaction(async (tx) => {
      numbered(await numbers.next(tx));
      await finished;
      if (outcome === 'rollback') throw new Error('payment registration failed');
    });
    return { number, finish, done };
  }

  const settledWithin = (promise: Promise<unknown>, ms: number) =>
    Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
    ]);

  it('makes the next first number of the year wait for the open purchase and then continue', async () => {
    const purchase = openPurchase('commit');
    expect(await purchase.number).toBe('ZW-2026-000001');

    const second = numbers.next();
    expect(await settledWithin(second, 300)).toBe(false);

    purchase.finish();
    await purchase.done;
    expect(await second).toBe('ZW-2026-000002');
  });

  it('starts from 000001 again when the first purchase of the year rolls back', async () => {
    const purchase = openPurchase('rollback');
    expect(await purchase.number).toBe('ZW-2026-000001');

    const second = numbers.next();
    expect(await settledWithin(second, 300)).toBe(false);

    purchase.finish();
    await expect(purchase.done).rejects.toThrow('payment registration failed');
    expect(await second).toBe('ZW-2026-000001');
  });

  it('does not block later numbers of the year behind an open purchase', async () => {
    await numbers.next();
    const purchase = openPurchase('commit');
    expect(await purchase.number).toBe('ZW-2026-000002');

    expect(await numbers.next()).toBe('ZW-2026-000003');

    purchase.finish();
    await purchase.done;
  });

  it('works inside a transaction that is rolled back', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        expect(await numbers.next(tx)).toBe('ZW-2026-000001');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    // The sequence was created in the rolled-back transaction and is gone with it.
    expect(await numbers.next()).toBe('ZW-2026-000001');
  });

  it('keeps more than six digits instead of truncating', async () => {
    await numbers.next();
    await prisma.$executeRawUnsafe(`SELECT setval('permit_number_2026', 999999)`);

    expect(await numbers.next()).toBe('ZW-2026-1000000');
  });
});
