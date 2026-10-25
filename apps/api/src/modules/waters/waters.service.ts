import { ErrorCode, WATERS_LIST_LIMIT, WaterStatus } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import type { FishingWater, Prisma } from '../../generated/prisma/client';
import { OrganizationsService } from '../organizations/organizations.service';
import type {
  OrgWaterDto,
  WaterDetailDto,
  WaterFilters,
  WaterListDto,
  WaterSummaryDto,
} from './dto/water.dto';

/** Owner of the water catalogue `FishingWater` (FR-06, FR-23). */
@Injectable()
export class WatersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  /** Published waters for the map and the list; at most WATERS_LIST_LIMIT, see `truncated`. */
  async list(filters: WaterFilters): Promise<WaterListDto> {
    const rows = await this.prisma.fishingWater.findMany({
      where: waterFilter(filters),
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        region: true,
        lat: true,
        lng: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      // One extra row tells whether the limit cut the result.
      take: WATERS_LIST_LIMIT + 1,
    });
    return {
      items: rows.slice(0, WATERS_LIST_LIMIT),
      truncated: rows.length > WATERS_LIST_LIMIT,
    };
  }

  /** Water card; an unpublished suggestion (FR-25) is as unknown as a missing id. */
  async get(id: string): Promise<WaterDetailDto> {
    const water = await this.prisma.fishingWater.findFirst({ where: { id, isPublished: true } });
    if (!water) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water not found');
    }
    const organization = water.organizationId
      ? await this.organizations.findPublicProfile(water.organizationId)
      : null;
    return { ...toSummary(water), ...toDetailFields(water), organization };
  }

  /** Waters connected to the organization (what its permit types may cover), by name. */
  listConnected(organizationId: string): Promise<OrgWaterDto[]> {
    return this.prisma.fishingWater.findMany({
      where: { organizationId, status: WaterStatus.CONNECTED },
      select: { id: true, name: true, type: true, region: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Those of `ids` that are connected to the organization. */
  async findConnectedIds(organizationId: string, ids: string[]): Promise<Set<string>> {
    const waters = await this.prisma.fishingWater.findMany({
      where: { id: { in: ids }, organizationId, status: WaterStatus.CONNECTED },
      select: { id: true },
    });
    return new Set(waters.map((water) => water.id));
  }

  /** Names of waters for lists of other modules (permit types), keyed by id. */
  async findNames(ids: string[]): Promise<Map<string, string>> {
    const waters = await this.prisma.fishingWater.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(waters.map((water) => [water.id, water.name]));
  }
}

export function waterFilter({
  region,
  type,
  status,
  q,
  bbox,
}: WaterFilters): Prisma.FishingWaterWhereInput {
  return {
    isPublished: true,
    region,
    type,
    status,
    name: q ? { contains: escapeLike(q), mode: 'insensitive' } : undefined,
    // A null coordinate fails both ranges, so waters without a position stay off the map.
    lng: bbox ? { gte: bbox.minLng, lte: bbox.maxLng } : undefined,
    lat: bbox ? { gte: bbox.minLat, lte: bbox.maxLat } : undefined,
  };
}

/** Prisma passes `contains` to ILIKE as is: `%` and `_` in a search must match themselves. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toSummary(water: FishingWater): WaterSummaryDto {
  const { id, name, type, status, region, lat, lng } = water;
  return { id, name, type, status, region, lat, lng };
}

function toDetailFields(water: FishingWater) {
  return {
    description: water.description,
    externalOwnerName: water.externalOwnerName,
    externalInfoUrl: water.externalInfoUrl,
    source: water.source,
    updatedAt: water.updatedAt.toISOString(),
  };
}
