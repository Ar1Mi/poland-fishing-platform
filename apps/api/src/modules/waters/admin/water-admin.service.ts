import { randomUUID } from 'node:crypto';
import { ErrorCode, isInBbox, POLAND_BOUNDS, WaterSource } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DomainError } from '../../../common/errors/domain-error';
import { StorageService } from '../../../common/storage/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import { type FishingWater, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import type {
  AdminWaterDto,
  AdminWatersQueryDto,
  SuggestWaterDto,
  UpdateWaterDto,
  WaterDetailDto,
} from '../dto/water.dto';
import { toWaterDetail } from '../waters.service';

/** The catalogue fields a super admin may change; `isPublished` is handled with them. */
const CATALOGUE_FIELDS = [
  'name',
  'type',
  'region',
  'lat',
  'lng',
  'externalOwnerName',
  'externalInfoUrl',
  'isPublished',
] as const;
type CatalogueField = (typeof CATALOGUE_FIELDS)[number];

/**
 * Suggestions of anglers (FR-25) and the super admin's own edits of the catalogue (T-27). A
 * suggestion is a `FishingWater` row with `source: USER` and `isPublished: false`: unknown to
 * the public catalogue until a super admin publishes it, with the fields corrected if needed, or
 * removes it. Nobody is recorded as its author (decided by the user: no personal data in the
 * catalogue), so the angler learns of the decision from the map.
 */
@Injectable()
export class WaterAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(WaterAdminService.name);
  }

  /** A suggestion: an unpublished row of the angler's source, with a UUID as its reference. */
  async suggest(dto: SuggestWaterDto): Promise<WaterDetailDto> {
    const water = await this.prisma.fishingWater.create({
      data: {
        ...dto,
        source: WaterSource.USER,
        sourceRef: randomUUID(),
        isPublished: false,
      },
    });
    return toWaterDetail(water, this.organizations);
  }

  /** The catalogue as the super admin sees it; the suggestions waiting longest come first. */
  async list({ published }: AdminWatersQueryDto): Promise<AdminWaterDto[]> {
    const waters = await this.prisma.fishingWater.findMany({
      where: { isPublished: published },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return waters.map(toAdminWater);
  }

  /**
   * Changes only the fields sent, under the row lock, and logs the diff; `isPublished: true`
   * publishes a suggestion. A position is both coordinates or none, in Poland.
   */
  async update(actorId: string, id: string, dto: UpdateWaterDto): Promise<AdminWaterDto> {
    const water = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, id);
      const diff: Partial<Record<CatalogueField, { from: unknown; to: unknown }>> = {};
      for (const field of CATALOGUE_FIELDS) {
        const value = dto[field];
        if (value !== undefined && value !== stored[field]) {
          diff[field] = { from: stored[field], to: value };
        }
      }
      // Only a new position is checked: a row imported with a position just outside the box
      // (the geocoder is limited by country, not by it) can still be renamed or published.
      if (diff.lat || diff.lng) {
        assertPosition(
          diff.lat ? (diff.lat.to as number | null) : stored.lat,
          diff.lng ? (diff.lng.to as number | null) : stored.lng,
        );
      }
      if (Object.keys(diff).length === 0) {
        return stored;
      }
      const updated = await tx.fishingWater.update({
        where: { id },
        data: Object.fromEntries(Object.entries(diff).map(([field, { to }]) => [field, to])),
      });
      await this.audit.record(tx, {
        actorId,
        action: 'WATER_UPDATED',
        entity: 'FishingWater',
        entityId: id,
        diff: diff as Prisma.InputJsonObject,
      });
      return updated;
    });
    return toAdminWater(water);
  }

  /**
   * Removes an unpublished row (a rejected suggestion). A published water stays: catches,
   * permits and claims may point at it, and anglers know its address. An unpublished row has
   * never been published (`PATCH` cannot hide a water again), so nothing of the other modules
   * refers to it: permit types and rules need a connected water, external permits and claims a
   * published one, and a catch a water of the catalogue or of its own permit. Some of those
   * links cascade (`_FishingWaterToPermitType`, `_ExternalPermitToFishingWater`,
   * `SpeciesRule`), so this invariant, not the foreign keys, is what keeps them; the keys that
   * restrict (claims, catches) still answer a race with `WATER_IN_USE`.
   */
  async delete(actorId: string, id: string): Promise<void> {
    let photoKey: string | null;
    try {
      photoKey = await this.prisma.$transaction(async (tx) => {
        const stored = await this.lock(tx, id);
        if (stored.isPublished) {
          throw new DomainError(ErrorCode.WATER_IN_USE, undefined, 'A published water stays');
        }
        await tx.fishingWater.delete({ where: { id } });
        await this.audit.record(tx, {
          actorId,
          action: 'WATER_DELETED',
          entity: 'FishingWater',
          entityId: id,
          diff: { name: stored.name, source: stored.source, sourceRef: stored.sourceRef },
        });
        return stored.photoKey;
      });
    } catch (error) {
      // Referenced after all (a race with a claim or a catch): the database decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new DomainError(ErrorCode.WATER_IN_USE, undefined, 'The water is referenced');
      }
      throw error;
    }
    if (photoKey) {
      try {
        await this.storage.delete(photoKey);
      } catch (error) {
        this.logger.error({ err: error, key: photoKey }, 'Could not remove a water photo');
      }
    }
  }

  /**
   * `FOR NO KEY UPDATE`, like the organization's edits of the same row: the key stays, so
   * foreign-key checks of inserts referencing the water need not wait.
   */
  private async lock(tx: Prisma.TransactionClient, id: string): Promise<FishingWater> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "FishingWater" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE`;
    if (locked.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water not found');
    }
    return tx.fishingWater.findUniqueOrThrow({ where: { id } });
  }
}

function assertPosition(lat: number | null, lng: number | null): void {
  const issue =
    (lat === null) !== (lng === null)
      ? 'lat and lng go together'
      : lat !== null && lng !== null && !isInBbox(lat, lng, POLAND_BOUNDS)
        ? 'lat/lng must lie in Poland (are they swapped?)'
        : null;
  if (issue) {
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      { fields: { lat: [issue] } },
      'Invalid position',
    );
  }
}

export function toAdminWater(water: FishingWater): AdminWaterDto {
  return {
    id: water.id,
    name: water.name,
    type: water.type,
    status: water.status,
    region: water.region,
    lat: water.lat,
    lng: water.lng,
    source: water.source,
    sourceRef: water.sourceRef,
    isPublished: water.isPublished,
    externalOwnerName: water.externalOwnerName,
    externalInfoUrl: water.externalInfoUrl,
    importedAt: water.importedAt?.toISOString() ?? null,
    createdAt: water.createdAt.toISOString(),
  };
}
