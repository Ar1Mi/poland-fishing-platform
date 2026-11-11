import {
  type DateOnly,
  EXTERNAL_PERMIT_PHOTO_EXTENSIONS,
  ErrorCode,
  externalPermitDatesIssue,
  externalPermitPhotoTypeOf,
  externalPermitStatus,
  isExternalPermitPhotoType,
  warsawDate,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { detectFileType } from '../../../common/storage/file-signature';
import { StorageService } from '../../../common/storage/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import { type ExternalPermit, Prisma } from '../../../generated/prisma/client';
import { SpeciesRulesService } from '../../rules/species-rules.service';
import { WatersService } from '../../waters/waters.service';
import type {
  CreateExternalPermitDto,
  ExternalOfflineBundleDto,
  ExternalPermitDto,
  UpdateExternalPermitDto,
} from '../dto/external-permit.dto';
import { fromDbDate, toDbDate } from '../permit-dates';
import { permitWaters } from '../permit-waters';

const PHOTO_FOLDER = 'external-permits';

const WITH_WATERS = { waters: { select: { id: true } } } as const;

type StoredExternalPermit = ExternalPermit & { waters: { id: string }[] };

export interface ExternalPermitPhoto {
  content: Buffer;
  type: string;
  fileName: string;
}

/**
 * External permits (FR-26): bought outside the platform, typed in by the angler with a photo
 * or scan, so that catches on any catalogue water go to the register — checked against the
 * general rules only (docs/02-business-rules.md). The angler's own data: every query is by
 * `userId`, and a permit of someone else is as unknown as a missing one.
 */
@Injectable()
export class ExternalPermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waters: WatersService,
    private readonly rules: SpeciesRulesService,
    private readonly storage: StorageService,
    private readonly clock: ClockService,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(ExternalPermitsService.name);
  }

  /** All external permits of the user, latest start first; a few a season, so no paging. */
  async list(userId: string): Promise<ExternalPermitDto[]> {
    const permits = await this.prisma.externalPermit.findMany({
      where: { userId },
      include: WITH_WATERS,
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return this.toDtos(permits);
  }

  async get(userId: string, id: string): Promise<ExternalPermitDto> {
    const [permit] = await this.toDtos([await this.find(this.prisma, userId, id)]);
    return permit!;
  }

  async create(userId: string, dto: CreateExternalPermitDto): Promise<ExternalPermitDto> {
    this.assertDates(dto.validFrom, dto.validTo);
    await this.assertPublished(dto.waterIds);
    const permit = await this.prisma.externalPermit.create({
      data: {
        userId,
        issuerName: dto.issuerName,
        number: dto.number || null,
        validFrom: toDbDate(dto.validFrom),
        validTo: toDbDate(dto.validTo),
        waters: { connect: dto.waterIds.map((id) => ({ id })) },
      },
      include: WITH_WATERS,
    });
    const [created] = await this.toDtos([permit]);
    return created!;
  }

  /**
   * Changes any of the fields. The catches already on the permit are not checked again: an
   * accepted catch never becomes a violation afterwards, as when rules change (user decision).
   * The row is locked, so two changes of the dates cannot together leave them out of order.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateExternalPermitDto,
  ): Promise<ExternalPermitDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, userId, id);
      const validFrom = dto.validFrom ?? fromDbDate(stored.validFrom);
      const validTo = dto.validTo ?? fromDbDate(stored.validTo);
      if (dto.validFrom !== undefined || dto.validTo !== undefined) {
        this.assertDates(validFrom, validTo);
      }
      if (dto.waterIds) {
        // A water already on the permit stays even if it has left the catalogue since.
        const current = new Set(stored.waters.map((water) => water.id));
        await this.assertPublished(dto.waterIds.filter((waterId) => !current.has(waterId)));
      }
      return tx.externalPermit.update({
        where: { id },
        data: {
          issuerName: dto.issuerName,
          number: dto.number === undefined ? undefined : dto.number || null,
          validFrom: toDbDate(validFrom),
          validTo: toDbDate(validTo),
          waters: dto.waterIds
            ? { set: dto.waterIds.map((waterId) => ({ id: waterId })) }
            : undefined,
        },
        include: WITH_WATERS,
      });
    });
    const [permit] = await this.toDtos([updated]);
    return permit!;
  }

  /**
   * A permit with catches stays (`CatchRecord.externalPermit` is `Restrict`): the database
   * refuses, also for a catch synced while this runs. Its photo goes with it.
   */
  async delete(userId: string, id: string): Promise<void> {
    let photoKey: string | null;
    try {
      photoKey = await this.prisma.$transaction(async (tx) => {
        const stored = await this.lock(tx, userId, id);
        await tx.externalPermit.delete({ where: { id } });
        return stored.photoKey;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new DomainError(
          ErrorCode.EXTERNAL_PERMIT_IN_USE,
          undefined,
          'An external permit with catches cannot be deleted',
        );
      }
      throw error;
    }
    if (photoKey) {
      await this.removeFile(photoKey);
    }
  }

  /**
   * Account deletion (T-26, ADR-0016), in the caller's transaction: the permits stay with their
   * catches (decided by the user), without the number and the photo. Returns the keys of the
   * photos, which the caller removes with `removePhotos` after the commit.
   */
  async anonymizeAllOfUser(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
    // A photo being replaced right now holds the row: its new key is read after it commits.
    const locked = await tx.$queryRaw<{ photoKey: string | null }[]>`
      SELECT "photoKey" FROM "ExternalPermit" WHERE "userId" = ${userId}::uuid
      ORDER BY "id" FOR UPDATE`;
    await tx.externalPermit.updateMany({
      where: { userId },
      data: { number: null, photoKey: null },
    });
    return locked.flatMap(({ photoKey }) => (photoKey ? [photoKey] : []));
  }

  /** After the commit of `anonymizeAllOfUser`; a file that cannot be removed is logged. */
  async removePhotos(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.removeFile(key);
    }
  }

  /** Stores the photo or scan of the permit, replacing the previous one. */
  async setPhoto(userId: string, id: string, photo: Buffer): Promise<ExternalPermitDto> {
    // The declared type and the file name are the client's word; the content decides.
    const mime = (await detectFileType(photo))?.mime;
    if (!mime || !isExternalPermitPhotoType(mime)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file must be a PDF, JPEG, PNG or WebP document'] } },
        'Unsupported photo type',
      );
    }
    let photoKey: string | undefined;
    let changed: { updated: StoredExternalPermit; replaced: string | null };
    try {
      changed = await this.prisma.$transaction(async (tx) => {
        const stored = await this.lock(tx, userId, id);
        photoKey = await this.storage.save(
          PHOTO_FOLDER,
          EXTERNAL_PERMIT_PHOTO_EXTENSIONS[mime],
          photo,
        );
        const updated = await tx.externalPermit.update({
          where: { id },
          data: { photoKey },
          include: WITH_WATERS,
        });
        return { updated, replaced: stored.photoKey };
      });
    } catch (error) {
      // The file system is not part of the transaction: a photo that was not stored goes.
      if (photoKey) {
        await this.removeFile(photoKey);
      }
      throw error;
    }
    if (changed.replaced) {
      await this.removeFile(changed.replaced);
    }
    const [permit] = await this.toDtos([changed.updated]);
    return permit!;
  }

  async deletePhoto(userId: string, id: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, userId, id);
      if (stored.photoKey) {
        await tx.externalPermit.update({ where: { id }, data: { photoKey: null } });
      }
      return stored.photoKey;
    });
    if (removed) {
      await this.removeFile(removed);
    }
  }

  /**
   * Read without a lock: a photo replaced or removed meanwhile has its file deleted, so a missing
   * file is looked up once more in the row before it counts as lost.
   */
  async readPhoto(userId: string, id: string): Promise<ExternalPermitPhoto> {
    let key = (await this.find(this.prisma, userId, id)).photoKey;
    for (let attempt = 1; ; attempt++) {
      const type = key ? externalPermitPhotoTypeOf(key) : undefined;
      if (!key || !type) {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'External permit has no photo');
      }
      try {
        const content = await this.storage.read(key);
        return {
          content,
          type,
          fileName: `zezwolenie-${id}.${EXTERNAL_PERMIT_PHOTO_EXTENSIONS[type]}`,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      const current = (await this.find(this.prisma, userId, id)).photoKey;
      if (current === key || attempt === 2) {
        // The row outlived its file (volume restored from an older backup, manual cleanup).
        this.logger.error({ externalPermitId: id, key }, 'Photo is missing');
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'External permit photo not found');
      }
      key = current;
    }
  }

  /**
   * The permit with the rules of its waters, for the PWA (T-21, ADR-0009): the general rules on
   * every water — the same `effectiveGeneral` `POST /catches/sync` checks such a catch against.
   */
  async offlineBundle(userId: string, id: string): Promise<ExternalOfflineBundleDto> {
    const [permit, general] = await Promise.all([
      this.get(userId, id),
      this.rules.effectiveGeneral(),
    ]);
    const rules = [...general]
      .map(([speciesId, rule]) => ({ speciesId, ...rule }))
      .sort((a, b) => a.speciesId.localeCompare(b.speciesId));
    return { permit, waterRules: permit.waters.map(({ id: waterId }) => ({ waterId, rules })) };
  }

  private async find(
    db: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<StoredExternalPermit> {
    const permit = await db.externalPermit.findFirst({
      where: { id, userId },
      include: WITH_WATERS,
    });
    if (!permit) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'External permit not found');
    }
    return permit;
  }

  /** Locks the user's permit for a change, then reads it with what was committed meanwhile. */
  private async lock(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<StoredExternalPermit> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ExternalPermit"
      WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
    if (locked.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'External permit not found');
    }
    return this.find(tx, userId, id);
  }

  private assertDates(validFrom: DateOnly, validTo: DateOnly): void {
    const issue = externalPermitDatesIssue(validFrom, validTo, warsawDate(this.clock.now()));
    if (issue) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { validTo: [DATES_MESSAGE[issue]] } },
        'Invalid dates of the external permit',
      );
    }
  }

  /** Waters are picked from the public catalogue. */
  private async assertPublished(waterIds: string[]): Promise<void> {
    const published = await this.waters.findPublishedIds(waterIds);
    const unknown = waterIds.filter((waterId) => !published.has(waterId));
    if (unknown.length > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { waterIds: [`${unknown.length} water(s) are not in the catalogue`] } },
        'External permit waters must be catalogue waters',
      );
    }
  }

  /** A file left behind is only wasted space: logged, not an error of the request. */
  private async removeFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({ err: error, key }, 'Could not remove an external permit photo');
    }
  }

  private async toDtos(permits: StoredExternalPermit[]): Promise<ExternalPermitDto[]> {
    const names = await this.waters.findNames([
      ...new Set(permits.flatMap((permit) => permit.waters.map((water) => water.id))),
    ]);
    const now = this.clock.now();
    return permits.map((permit) => {
      const validFrom = fromDbDate(permit.validFrom);
      const validTo = fromDbDate(permit.validTo);
      return {
        id: permit.id,
        issuerName: permit.issuerName,
        number: permit.number,
        status: externalPermitStatus({ validFrom, validTo }, now),
        validFrom,
        validTo,
        waters: permitWaters(permit.waters, names),
        photoType: (permit.photoKey && externalPermitPhotoTypeOf(permit.photoKey)) ?? null,
        createdAt: permit.createdAt.toISOString(),
      };
    });
  }
}

const DATES_MESSAGE = {
  ORDER: 'validTo must not be before validFrom',
  TOO_LONG: 'the permit must not last longer than 366 days',
  TOO_LATE: 'validFrom must not be more than 365 days ahead',
  OUT_OF_SEASONS: 'the dates must fall in the years 2000–2100',
} as const;
