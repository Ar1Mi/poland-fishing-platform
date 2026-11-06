import {
  ErrorCode,
  WATER_PHOTO_EXTENSIONS,
  isWaterPhotoType,
  waterPhotoTypeOf,
  type WaterPhotoType,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DomainError } from '../../../common/errors/domain-error';
import { detectFileType } from '../../../common/storage/file-signature';
import { StorageService } from '../../../common/storage/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import type { FishingWater, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import type { UpdateWaterProfileDto, WaterDetailDto } from '../dto/water.dto';
import { toWaterDetail } from '../waters.service';

/** Folder of water photos in StorageService. */
const PHOTO_FOLDER = 'waters';

const PROFILE_FIELDS = ['description', 'seasonInfo'] as const;

export interface WaterPhoto {
  content: Buffer;
  type: WaterPhotoType;
  fileName: string;
}

/**
 * What an organization tells anglers about its connected water (FR-05): description, season and
 * photo. The catalogue fields stay with the import (`05-api.md`), so an import never undoes these
 * edits and they never touch `importedAt`. Every change is locked on the water row and logged in
 * the same transaction (`AuditLog`).
 */
@Injectable()
export class WaterProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(WaterProfileService.name);
  }

  /** Changes only the fields sent; a request that changes nothing writes nothing. */
  async update(
    organizationId: string,
    actorId: string,
    waterId: string,
    dto: UpdateWaterProfileDto,
  ): Promise<WaterDetailDto> {
    const water = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lockConnected(tx, organizationId, waterId);
      const diff: Record<string, { from: string | null; to: string | null }> = {};
      for (const field of PROFILE_FIELDS) {
        const value = dto[field];
        if (value !== undefined && value !== stored[field]) {
          diff[field] = { from: stored[field], to: value };
        }
      }
      if (Object.keys(diff).length === 0) {
        return stored;
      }
      const updated = await tx.fishingWater.update({
        where: { id: waterId },
        data: Object.fromEntries(Object.entries(diff).map(([field, { to }]) => [field, to])),
      });
      await this.audit.record(tx, {
        actorId,
        action: 'WATER_PROFILE_UPDATED',
        entity: 'FishingWater',
        entityId: waterId,
        diff: { organizationId, ...diff },
      });
      return updated;
    });
    return toWaterDetail(water, this.organizations);
  }

  /** Stores the photo of the card (JPEG, PNG or WebP by content), replacing the previous one. */
  async setPhoto(
    organizationId: string,
    actorId: string,
    waterId: string,
    photo: Buffer,
  ): Promise<WaterDetailDto> {
    // The declared type and the file name are the client's word; the content decides.
    const mime = (await detectFileType(photo))?.mime;
    if (!mime || !isWaterPhotoType(mime)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file must be a JPEG, PNG or WebP image'] } },
        'Unsupported photo type',
      );
    }
    let photoKey: string | undefined;
    let changed: { updated: FishingWater; replaced: string | null };
    try {
      changed = await this.prisma.$transaction(async (tx) => {
        const stored = await this.lockConnected(tx, organizationId, waterId);
        photoKey = await this.storage.save(PHOTO_FOLDER, WATER_PHOTO_EXTENSIONS[mime], photo);
        const updated = await tx.fishingWater.update({
          where: { id: waterId },
          data: { photoKey },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'WATER_PHOTO_SET',
          entity: 'FishingWater',
          entityId: waterId,
          diff: { organizationId, replaced: stored.photoKey !== null, type: mime },
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
    return toWaterDetail(changed.updated, this.organizations);
  }

  async deletePhoto(organizationId: string, actorId: string, waterId: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lockConnected(tx, organizationId, waterId);
      if (stored.photoKey) {
        await tx.fishingWater.update({ where: { id: waterId }, data: { photoKey: null } });
        await this.audit.record(tx, {
          actorId,
          action: 'WATER_PHOTO_DELETED',
          entity: 'FishingWater',
          entityId: waterId,
          diff: { organizationId },
        });
      }
      return stored.photoKey;
    });
    if (removed) {
      await this.removeFile(removed);
    }
  }

  /**
   * The public photo of a published water. Read without a lock: a photo replaced meanwhile has
   * its file deleted, so a missing file is looked up once more in the row before it counts as lost.
   */
  async readPhoto(waterId: string): Promise<WaterPhoto> {
    const keyOf = async () =>
      (
        await this.prisma.fishingWater.findFirst({
          where: { id: waterId, isPublished: true },
          select: { photoKey: true },
        })
      )?.photoKey ?? null;
    let key = await keyOf();
    for (let attempt = 1; ; attempt++) {
      const type = key ? waterPhotoTypeOf(key) : undefined;
      if (!key || !type) {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water has no photo');
      }
      try {
        const content = await this.storage.read(key);
        return { content, type, fileName: `lowisko-${waterId}.${WATER_PHOTO_EXTENSIONS[type]}` };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      const current = await keyOf();
      if (current === key || attempt === 2) {
        // The row outlived its file (volume restored from an older backup, manual cleanup).
        this.logger.error({ waterId, key }, 'Water photo is missing');
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water photo not found');
      }
      key = current;
    }
  }

  /**
   * Locks a water connected to the organization, then reads it with what was committed meanwhile.
   * Another organization's or an unconnected water is as unknown as a missing one.
   */
  private async lockConnected(
    tx: Prisma.TransactionClient,
    organizationId: string,
    waterId: string,
  ): Promise<FishingWater> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "FishingWater"
      WHERE "id" = ${waterId}::uuid AND "organizationId" = ${organizationId}::uuid
        AND "status" = 'CONNECTED'
      FOR UPDATE`;
    if (locked.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water not found');
    }
    return tx.fishingWater.findUniqueOrThrow({ where: { id: waterId } });
  }

  /** A file left behind is only wasted space: logged, not an error of the request. */
  private async removeFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({ err: error, key }, 'Could not remove a water photo');
    }
  }
}
