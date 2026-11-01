import { randomUUID } from 'node:crypto';
import {
  CatchSyncStatus,
  type DateOnly,
  ErrorCode,
  type RuleViolation,
  type SameDayCatch,
  addDays,
  catchEditableUntil,
  isCatchEditable,
  validateCatch,
  warsawDate,
  warsawDayEnd,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { type CatchRecord, Prisma } from '../../generated/prisma/client';
import { WatersService } from '../waters/waters.service';
import { type CatchData, CatchContextLoader, type LoadedContexts } from './catch-context.loader';
import type {
  CatchDto,
  MyCatchesQueryDto,
  SyncCatchItemDto,
  SyncCatchResultDto,
  UpdateCatchDto,
} from './dto/catch.dto';

/**
 * The register of catches (FR-11, FR-12): recording them in batches from the device, checked by
 * the CatchValidator of `packages/shared`; the angler's list; changes within the BR-07 window.
 */
@Injectable()
export class CatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: CatchContextLoader,
    private readonly waters: WatersService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Records a batch (ADR-0009): every catch is stored, ACCEPTED or REJECTED with its violations.
   * A clientId already stored for the user returns the stored result, unchecked. The new ones are
   * checked in the order of `caughtAt`, each against the accepted kept catches of its day — those
   * stored before (of any time of the day) and those accepted earlier in the batch.
   * Unknown references reject the whole batch: they are input errors, not rule violations.
   */
  async sync(userId: string, items: SyncCatchItemDto[]): Promise<SyncCatchResultDto[]> {
    assertBatch(items);
    const catches = items.map(catchDataOf);
    const loaded = await this.contexts.load(userId, catches);
    assertKnown(loaded, (index, field) => `items.${index}.${field}`);
    const now = this.clock.now();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockRegister(tx, userId);
        const stored = await tx.catchRecord.findMany({
          where: { clientId: { in: items.map((item) => item.clientId) } },
        });
        const taken = stored.filter((row) => row.userId !== userId).map((row) => row.clientId);
        if (taken.length > 0) {
          throw validationFailed(
            Object.fromEntries(
              items.flatMap((item, index) =>
                taken.includes(item.clientId)
                  ? [[`items.${index}.clientId`, ['clientId is already used']]]
                  : [],
              ),
            ),
          );
        }
        const results = new Map(stored.map((row) => [row.clientId, resultOf(row)]));

        const fresh = items
          .map((_, index) => index)
          .filter((index) => !results.has(items[index]!.clientId))
          .sort(
            (a, b) =>
              catches[a]!.caughtAt.getTime() - catches[b]!.caughtAt.getTime() ||
              items[a]!.clientId.localeCompare(items[b]!.clientId),
          );
        const kept = await keptOnDays(
          tx,
          userId,
          fresh.map((index) => catches[index]!.caughtAt),
        );
        const rows: Prisma.CatchRecordCreateManyInput[] = [];
        for (const index of fresh) {
          const fish = catches[index]!;
          const item = items[index]!;
          const violations = validateCatch({
            ...loaded.contextOf(index),
            sameDayKept: kept,
            now,
          });
          const row = {
            id: randomUUID(),
            clientId: item.clientId,
            userId,
            ...fish,
            lat: item.lat ?? null,
            lng: item.lng ?? null,
            ...verdict(violations),
          };
          rows.push(row);
          results.set(item.clientId, {
            clientId: item.clientId,
            id: row.id,
            status: row.syncStatus,
            violations,
          });
          if (violations.length === 0 && fish.kept) {
            kept.push(fish);
          }
        }
        await tx.catchRecord.createMany({ data: rows });
        return items.map((item) => results.get(item.clientId)!);
      });
    } catch (error) {
      // A clientId taken by someone else's catch committed meanwhile: the lock is per user.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw validationFailed({ items: ['clientId is already used'] });
      }
      throw error;
    }
  }

  /** My catches of a season (Warsaw calendar year), latest first; a season is not paged. */
  async list(userId: string, { season, permitId }: MyCatchesQueryDto): Promise<CatchDto[]> {
    const year = season ?? Number(warsawDate(this.clock.now()).slice(0, 4));
    const rows = await this.prisma.catchRecord.findMany({
      where: {
        userId,
        permitId,
        caughtAt: { gte: dayStart(`${year}-01-01`), lt: warsawDayEnd(`${year}-12-31`) },
      },
      orderBy: [{ caughtAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return this.toDtos(rows);
  }

  /**
   * Changes a catch within the BR-07 window and checks it again (docs/02-business-rules.md →
   * «Уточнения (T-18)»): the verdict replaces the stored one, the other catches stay as they are.
   * The references are loaded before the transaction, so the write is conditional on the row it
   * was built from: a change of the same catch committed in between (another phone) makes it
   * start over from the new row instead of overwriting that change with stale fields.
   */
  async update(userId: string, id: string, dto: UpdateCatchDto): Promise<CatchDto> {
    for (let attempt = 1; ; attempt++) {
      const updated = await this.tryUpdate(userId, id, dto);
      if (updated) {
        const [changed] = await this.toDtos([updated]);
        return changed!;
      }
      if (attempt === UPDATE_ATTEMPTS) {
        throw new Error(`Catch ${id} kept changing during ${UPDATE_ATTEMPTS} updates`);
      }
    }
  }

  /** One attempt of `update`; `null` when the row changed since it was read. */
  private async tryUpdate(
    userId: string,
    id: string,
    dto: UpdateCatchDto,
  ): Promise<CatchRecord | null> {
    const current = await this.find(userId, id);
    const now = this.clock.now();
    assertEditable(current.caughtAt, now);
    const next: CatchData = {
      ...catchDataOf(current),
      ...definedFields(dto),
      caughtAt: dto.caughtAt === undefined ? current.caughtAt : new Date(dto.caughtAt),
    };
    if (dto.caughtAt !== undefined) {
      // A catch cannot be moved into a day whose window has closed.
      assertEditable(next.caughtAt, now);
    }
    const loaded = await this.contexts.load(userId, [next]);
    assertKnown(loaded, (_, field) => field);

    return this.prisma.$transaction(async (tx) => {
      await lockRegister(tx, userId);
      const kept = await keptOnDays(tx, userId, [next.caughtAt], id);
      const violations = validateCatch({ ...loaded.contextOf(0), sameDayKept: kept, now });
      const { syncStatus, violations: stored } = verdict(violations);
      const { count } = await tx.catchRecord.updateMany({
        where: { id, userId, updatedAt: current.updatedAt },
        data: { ...next, syncStatus, violations: stored ?? Prisma.DbNull },
      });
      // Changed or deleted meanwhile: the next attempt reads it again (or answers NOT_FOUND).
      return count === 0 ? null : tx.catchRecord.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Deletes a catch within the BR-07 window. */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Like every write to the register: a sync running meanwhile sees the catch or its absence.
      await lockRegister(tx, userId);
      const current = await tx.catchRecord.findFirst({ where: { id, userId } });
      if (!current) {
        throw notFound();
      }
      assertEditable(current.caughtAt, this.clock.now());
      await tx.catchRecord.delete({ where: { id } });
    });
  }

  /** A catch of someone else is as unknown as a missing one. */
  private async find(userId: string, id: string): Promise<CatchRecord> {
    const row = await this.prisma.catchRecord.findFirst({ where: { id, userId } });
    if (!row) {
      throw notFound();
    }
    return row;
  }

  private async toDtos(rows: CatchRecord[]): Promise<CatchDto[]> {
    const names = await this.waters.findNames([...new Set(rows.map((row) => row.fishingWaterId))]);
    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      permitId: row.permitId,
      externalPermitId: row.externalPermitId,
      water: { id: row.fishingWaterId, name: names.get(row.fishingWaterId) ?? '' },
      speciesId: row.speciesId,
      caughtAt: row.caughtAt.toISOString(),
      lengthCm: row.lengthCm,
      weightG: row.weightG,
      kept: row.kept,
      lat: row.lat,
      lng: row.lng,
      status: row.syncStatus,
      violations: violationsOf(row),
      editableUntil: catchEditableUntil(row.caughtAt).toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

/** Attempts of `update` while other changes of the same catch keep being committed. */
const UPDATE_ATTEMPTS = 3;

/**
 * Serializes the writes to one user's register (transaction-scoped advisory lock): two phones
 * syncing at once see each other's accepted catches, so together they cannot exceed a daily
 * limit (scenario Б). After the lock a new statement sees what the holder committed (READ
 * COMMITTED). A key, not a row of `User`: that table belongs to UsersModule.
 */
async function lockRegister(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catches:${userId}`}, 0))`;
}

/** The first instant of the Warsaw day `date`. */
function dayStart(date: DateOnly): Date {
  return warsawDayEnd(addDays(date, -1));
}

/**
 * Accepted kept catches of the user on the Warsaw days of `dates`, of every water (the daily
 * limits count them all, docs/02-business-rules.md); the validator picks the species and the day.
 */
async function keptOnDays(
  tx: Prisma.TransactionClient,
  userId: string,
  dates: Date[],
  exceptId?: string,
): Promise<SameDayCatch[]> {
  const days = [...new Set(dates.map(warsawDate))];
  if (days.length === 0) {
    return [];
  }
  return tx.catchRecord.findMany({
    where: {
      userId,
      kept: true,
      syncStatus: CatchSyncStatus.ACCEPTED,
      id: exceptId === undefined ? undefined : { not: exceptId },
      OR: days.map((day) => ({ caughtAt: { gte: dayStart(day), lt: warsawDayEnd(day) } })),
    },
    select: { speciesId: true, caughtAt: true, weightG: true, kept: true },
  });
}

function catchDataOf(source: SyncCatchItemDto | CatchRecord): CatchData {
  return {
    permitId: source.permitId ?? null,
    externalPermitId: source.externalPermitId ?? null,
    fishingWaterId: source.fishingWaterId,
    speciesId: source.speciesId,
    caughtAt: new Date(source.caughtAt),
    lengthCm: source.lengthCm,
    weightG: source.weightG ?? null,
    kept: source.kept,
  };
}

/** The fields an update sends, but `caughtAt`: the caller parses it. */
function definedFields(dto: UpdateCatchDto): Partial<CatchData> {
  return Object.fromEntries(
    Object.entries(dto).filter(([key, value]) => key !== 'caughtAt' && value !== undefined),
  );
}

function verdict(violations: RuleViolation[]): {
  syncStatus: CatchSyncStatus;
  violations: Prisma.InputJsonArray | undefined;
} {
  return violations.length === 0
    ? { syncStatus: CatchSyncStatus.ACCEPTED, violations: undefined }
    : {
        syncStatus: CatchSyncStatus.REJECTED,
        // Codes, rule ids and plain details: JSON as they are.
        violations: violations as unknown as Prisma.InputJsonArray,
      };
}

function violationsOf(row: CatchRecord): RuleViolation[] {
  return (row.violations as RuleViolation[] | null) ?? [];
}

function resultOf(row: CatchRecord): SyncCatchResultDto {
  return {
    clientId: row.clientId,
    id: row.id,
    status: row.syncStatus,
    violations: violationsOf(row),
  };
}

/** Each clientId once; each catch on exactly one permit (`catch_exactly_one_permit`). */
function assertBatch(items: SyncCatchItemDto[]): void {
  const fields: Record<string, string[]> = {};
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.clientId)) {
      fields[`items.${index}.clientId`] = ['clientId is repeated in the batch'];
    }
    seen.add(item.clientId);
    const onPlatform = (item.permitId ?? null) !== null;
    const onExternal = (item.externalPermitId ?? null) !== null;
    if (onPlatform === onExternal) {
      fields[`items.${index}.permitId`] = ['Exactly one of permitId and externalPermitId'];
    }
  });
  if (Object.keys(fields).length > 0) {
    throw validationFailed(fields);
  }
}

function assertKnown(
  loaded: LoadedContexts,
  fieldName: (index: number, field: string) => string,
): void {
  if (loaded.unknown.length > 0) {
    throw validationFailed(
      Object.fromEntries(
        loaded.unknown.map(({ index, field }) => [fieldName(index, field), [`Unknown ${field}`]]),
      ),
    );
  }
}

function assertEditable(caughtAt: Date, now: Date): void {
  if (!isCatchEditable(caughtAt, now)) {
    throw new DomainError(
      ErrorCode.EDIT_WINDOW_CLOSED,
      { editableUntil: catchEditableUntil(caughtAt).toISOString() },
      'The catch can no longer be changed',
    );
  }
}

function validationFailed(fields: Record<string, string[]>): DomainError {
  return new DomainError(ErrorCode.VALIDATION_FAILED, { fields }, 'Request validation failed');
}

function notFound(): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, undefined, 'Catch not found');
}
