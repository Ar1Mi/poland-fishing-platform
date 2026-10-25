import {
  DiscountKind,
  ErrorCode,
  OrganizationStatus,
  PERMIT_TYPE_LOCKED_FIELDS,
  type PermitTypeLockedField,
  WaterStatus,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../database/prisma.service';
import type { PermitType, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { WatersService } from '../../waters/waters.service';
import type {
  CreatePermitTypeDto,
  LowestPriceDto,
  OrgPermitTypeDto,
  PermitTypeDto,
  UpdatePermitTypeDto,
} from '../dto/permit-type.dto';

/** A permit type with the ids of its waters and whether permits of it exist. */
type StoredPermitType = PermitType & { waters: { id: string }[]; _count: { permits: number } };

const withWatersAndPermits = {
  waters: { select: { id: true } },
  _count: { select: { permits: true } },
} satisfies Prisma.PermitTypeInclude;

/** Fields a PATCH may change, in the order they are compared. */
const EDITABLE_FIELDS = [
  'name',
  'durationDays',
  'priceGrosze',
  'discountKind',
  'waterIds',
  'isActive',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Permit types of organizations (FR-07): CRUD for the admin, the offer of a water for everyone. */
@Injectable()
export class PermitTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waters: WatersService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  /** Every type of the organization, sold or not: active first, then by name. */
  async listForOrganization(organizationId: string): Promise<OrgPermitTypeDto[]> {
    const types = await this.prisma.permitType.findMany({
      where: { organizationId },
      include: withWatersAndPermits,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return this.toOrgPermitTypes(types);
  }

  async get(organizationId: string, id: string): Promise<OrgPermitTypeDto> {
    const [type] = await this.toOrgPermitTypes([await this.find(organizationId, id)]);
    return type!;
  }

  async create(
    organizationId: string,
    actorId: string,
    dto: CreatePermitTypeDto,
  ): Promise<OrgPermitTypeDto> {
    await this.assertConnected(organizationId, dto.waterIds);
    const { waterIds, ...fields } = dto;
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.permitType.create({
        data: { ...fields, organizationId, waters: { connect: waterIds.map((id) => ({ id })) } },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'PERMIT_TYPE_CREATED',
        entity: 'PermitType',
        entityId: created.id,
        diff: { ...fields, waterIds },
      });
      return created.id;
    });
    return this.get(organizationId, id);
  }

  /**
   * Changes the given fields. A type with permits keeps its terms (PERMIT_TYPE_LOCKED_FIELDS):
   * changing one of them → PERMIT_TYPE_IN_USE; sending it unchanged is fine (a full form).
   */
  async update(
    organizationId: string,
    actorId: string,
    id: string,
    dto: UpdatePermitTypeDto,
  ): Promise<OrgPermitTypeDto> {
    if (dto.waterIds) {
      await this.assertConnected(organizationId, dto.waterIds);
    }
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForChange(tx, organizationId, id);
      const changed = changedFields(current, dto);
      const locked = lockedChanges(current, changed);
      if (locked.length > 0) {
        throw new DomainError(
          ErrorCode.PERMIT_TYPE_IN_USE,
          { lockedFields: locked },
          'Permits of this type exist: its terms cannot change',
        );
      }
      if (changed.length === 0) {
        return;
      }
      const { waterIds, ...fields } = pick(dto, changed);
      await tx.permitType.update({
        where: { id },
        data: { ...fields, waters: waterIds && { set: waterIds.map((id) => ({ id })) } },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'PERMIT_TYPE_UPDATED',
        entity: 'PermitType',
        entityId: id,
        diff: Object.fromEntries(
          changed.map((field) => [
            field,
            // A changed field is one the DTO sets.
            { from: valueOf(current, field), to: dto[field] as Prisma.InputJsonValue },
          ]),
        ),
      });
    });
    return this.get(organizationId, id);
  }

  /** Only a type nobody has bought: a sold one is deactivated instead (PERMIT_TYPE_IN_USE). */
  async remove(organizationId: string, actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForChange(tx, organizationId, id);
      if (current._count.permits > 0) {
        throw new DomainError(
          ErrorCode.PERMIT_TYPE_IN_USE,
          undefined,
          'Permits of this type exist: deactivate it instead',
        );
      }
      // The rows linking the type to its waters go with it (ON DELETE CASCADE).
      await tx.permitType.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'PERMIT_TYPE_DELETED',
        entity: 'PermitType',
        entityId: id,
        diff: {
          name: current.name,
          durationDays: current.durationDays,
          priceGrosze: current.priceGrosze,
          discountKind: current.discountKind,
          waterIds: valueOf(current, 'waterIds'),
          isActive: current.isActive,
        },
      });
    });
  }

  /**
   * What an angler can buy for the water now: active types of an ACTIVE organization, by
   * duration (regular before discounted). Unknown or unpublished water → NOT_FOUND.
   */
  async listForWater(waterId: string): Promise<PermitTypeDto[]> {
    const water = await this.waters.get(waterId);
    if (water.status !== WaterStatus.CONNECTED || !water.organization?.isActive) {
      return [];
    }
    const types = await this.prisma.permitType.findMany({
      where: {
        organizationId: water.organization.id,
        isActive: true,
        waters: { some: { id: waterId } },
      },
      orderBy: [{ durationDays: 'asc' }, { discountKind: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return types.map(toPermitType);
  }

  /**
   * The «od» price of catalogue cards: per water, the lowest price of an active regular type
   * of an ACTIVE organization. Waters without one are left out.
   */
  async lowestPrices(waterIds: string[]): Promise<LowestPriceDto[]> {
    const types = await this.prisma.permitType.findMany({
      where: {
        isActive: true,
        discountKind: DiscountKind.NONE,
        waters: { some: { id: { in: waterIds } } },
      },
      select: {
        organizationId: true,
        priceGrosze: true,
        waters: { where: { id: { in: waterIds } }, select: { id: true } },
      },
    });
    const organizations = await this.organizations.findSummaries([
      ...new Set(types.map((type) => type.organizationId)),
    ]);
    const lowest = new Map<string, number>();
    for (const type of types) {
      if (organizations.get(type.organizationId)?.status !== OrganizationStatus.ACTIVE) {
        continue;
      }
      for (const { id } of type.waters) {
        lowest.set(id, Math.min(lowest.get(id) ?? Infinity, type.priceGrosze));
      }
    }
    return waterIds.flatMap((waterId) => {
      const priceGrosze = lowest.get(waterId);
      return priceGrosze === undefined ? [] : [{ waterId, priceGrosze }];
    });
  }

  private async find(organizationId: string, id: string): Promise<StoredPermitType> {
    // A type of another organization is as unknown as a missing one.
    const type = await this.prisma.permitType.findFirst({
      where: { id, organizationId },
      include: withWatersAndPermits,
    });
    if (!type) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit type not found');
    }
    return type;
  }

  /**
   * Locks the type row and reads it with the permit count. FOR UPDATE conflicts with the
   * KEY SHARE lock that inserting a Permit takes on its type (the foreign key check): a sale
   * running now either commits first and is counted here, or waits until this change is
   * committed. A plain UPDATE (FOR NO KEY UPDATE) would not stop it, and a permit could be
   * sold for waters the type is just losing.
   */
  private async lockForChange(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<StoredPermitType> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PermitType"
      WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    if (locked.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit type not found');
    }
    // A new statement after the lock: it sees permits committed while this one waited.
    return tx.permitType.findUniqueOrThrow({ where: { id }, include: withWatersAndPermits });
  }

  /** Every water must be connected to the organization: a type cannot sell someone else's. */
  private async assertConnected(organizationId: string, waterIds: string[]): Promise<void> {
    const connected = await this.waters.findConnectedIds(organizationId, waterIds);
    const foreign = waterIds.filter((id) => !connected.has(id));
    if (foreign.length > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        {
          fields: {
            waterIds: [`${foreign.length} water(s) are not connected to the organization`],
          },
        },
        'Permit type waters must be connected to the organization',
      );
    }
  }

  private async toOrgPermitTypes(types: StoredPermitType[]): Promise<OrgPermitTypeDto[]> {
    const names = await this.waters.findNames([
      ...new Set(types.flatMap((type) => type.waters.map((water) => water.id))),
    ]);
    return types.map((type) => ({
      ...toPermitType(type),
      isActive: type.isActive,
      inUse: type._count.permits > 0,
      waters: type.waters
        .map(({ id }) => ({ id, name: names.get(id) ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.id.localeCompare(b.id)),
      createdAt: type.createdAt.toISOString(),
    }));
  }
}

/** Fields of `dto` whose value differs from the stored type; waters compare as a set. */
export function changedFields(
  current: Pick<StoredPermitType, Exclude<EditableField, 'waterIds'> | 'waters'>,
  dto: UpdatePermitTypeDto,
): EditableField[] {
  return EDITABLE_FIELDS.filter((field) => {
    const next = dto[field];
    if (next === undefined) {
      return false;
    }
    if (field === 'waterIds') {
      const stored = new Set(current.waters.map((water) => water.id));
      const ids = next as string[];
      return ids.length !== stored.size || ids.some((id) => !stored.has(id));
    }
    return next !== current[field];
  });
}

/** Of the changed fields, those a type with permits must keep. */
export function lockedChanges(
  current: { _count: { permits: number } },
  changed: EditableField[],
): PermitTypeLockedField[] {
  if (current._count.permits === 0) {
    return [];
  }
  return PERMIT_TYPE_LOCKED_FIELDS.filter((field) => changed.includes(field));
}

function valueOf(type: StoredPermitType, field: EditableField): Prisma.InputJsonValue {
  return field === 'waterIds' ? type.waters.map((water) => water.id).sort() : type[field];
}

function pick(dto: UpdatePermitTypeDto, fields: EditableField[]): UpdatePermitTypeDto {
  return Object.fromEntries(fields.map((field) => [field, dto[field]]));
}

function toPermitType(type: PermitType): PermitTypeDto {
  const { id, name, durationDays, priceGrosze, discountKind } = type;
  return { id, name, durationDays, priceGrosze, discountKind };
}
