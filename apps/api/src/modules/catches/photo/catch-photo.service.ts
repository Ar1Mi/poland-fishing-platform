import {
  CATCH_PHOTO_EXTENSIONS,
  type CatchPhotoType,
  ErrorCode,
  catchPhotoTypeOf,
  isCatchPhotoType,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { detectFileType } from '../../../common/storage/file-signature';
import { StorageService } from '../../../common/storage/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import type { CatchRecord, Prisma } from '../../../generated/prisma/client';
import { UsersService } from '../../users/users.service';
import { CatchesService, assertEditable } from '../catches.service';
import type { CatchDto } from '../dto/catch.dto';

/** Folder of catch photos in StorageService. */
export const CATCH_PHOTO_FOLDER = 'catches';

export interface CatchPhoto {
  content: Buffer;
  type: CatchPhotoType;
  fileName: string;
}

/**
 * The photo of a catch (FR-14, T-27): added, replaced or removed by the owner within the BR-07
 * window of the catch, like its other fields; read by the owner only (the register is personal).
 * The file is written while the catch row is locked (`FOR UPDATE`) and the replaced one is
 * removed after the commit, as for the photo of an external permit (T-22).
 */
@Injectable()
export class CatchPhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catches: CatchesService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly clock: ClockService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(CatchPhotoService.name);
  }

  /** Stores the photo (JPEG, PNG or WebP by content), replacing the previous one. */
  async setPhoto(userId: string, id: string, photo: Buffer): Promise<CatchDto> {
    // The declared type and the file name are the client's word; the content decides.
    const mime = (await detectFileType(photo))?.mime;
    if (!mime || !isCatchPhotoType(mime)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file must be a JPEG, PNG or WebP image'] } },
        'Unsupported photo type',
      );
    }
    let photoKey: string | undefined;
    let changed: { updated: CatchRecord; replaced: string | null };
    try {
      changed = await this.prisma.$transaction(async (tx) => {
        // A deletion of the account under way wins: no new personal file after it.
        await this.users.assertActiveForWrite(tx, userId);
        const stored = await this.lock(tx, userId, id);
        assertEditable(stored.caughtAt, this.clock.now());
        photoKey = await this.storage.save(CATCH_PHOTO_FOLDER, CATCH_PHOTO_EXTENSIONS[mime], photo);
        const updated = await tx.catchRecord.update({ where: { id }, data: { photoKey } });
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
    const [fish] = await this.catches.toDtos([changed.updated]);
    return fish!;
  }

  /** Removes the photo within the window; a catch without one answers the same. */
  async deletePhoto(userId: string, id: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, userId, id);
      assertEditable(stored.caughtAt, this.clock.now());
      if (stored.photoKey) {
        await tx.catchRecord.update({ where: { id }, data: { photoKey: null } });
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
  async readPhoto(userId: string, id: string): Promise<CatchPhoto> {
    let key = (await this.find(userId, id)).photoKey;
    for (let attempt = 1; ; attempt++) {
      const type = key ? catchPhotoTypeOf(key) : undefined;
      if (!key || !type) {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Catch has no photo');
      }
      try {
        const content = await this.storage.read(key);
        return { content, type, fileName: `polow-${id}.${CATCH_PHOTO_EXTENSIONS[type]}` };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      const current = (await this.find(userId, id)).photoKey;
      if (current === key || attempt === 2) {
        // The row outlived its file (volume restored from an older backup, manual cleanup).
        this.logger.error({ catchId: id, key }, 'Catch photo is missing');
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Catch photo not found');
      }
      key = current;
    }
  }

  /** After the commit of a deletion (of the catch or the account); a failure is logged. */
  async removePhotos(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.removeFile(key);
    }
  }

  /** A catch of someone else is as unknown as a missing one. */
  private async find(userId: string, id: string): Promise<CatchRecord> {
    const row = await this.prisma.catchRecord.findFirst({ where: { id, userId } });
    if (!row) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Catch not found');
    }
    return row;
  }

  /** Locks the user's catch for a change, then reads it with what was committed meanwhile. */
  private async lock(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<CatchRecord> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "CatchRecord"
      WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
    if (locked.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Catch not found');
    }
    return tx.catchRecord.findUniqueOrThrow({ where: { id } });
  }

  /** A file left behind is only wasted space: logged, not an error of the request. */
  private async removeFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({ err: error, key }, 'Could not remove a catch photo');
    }
  }
}
