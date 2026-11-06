import {
  effectivePermitStatus,
  ErrorCode,
  isRevocable,
  PAGE_SIZE_DEFAULT,
  type Page,
  PermitStatus,
  type SoldPermitStatus,
  warsawDate,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { escapeLike } from '../../../database/like';
import { PrismaService } from '../../../database/prisma.service';
import type { Permit, PermitType, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { UsersService } from '../../users/users.service';
import type { ListOrgPermitsQueryDto, OrgPermitDto } from '../dto/org-permit.dto';
import { fromDbDate, toDbDate } from '../permit-dates';

type StoredPermit = Permit & { permitType: Pick<PermitType, 'id' | 'name'> };

const WITH_TYPE = { permitType: { select: { id: true, name: true } } } as const;

/**
 * Permits sold by an organization (FR-10): the list for its admin and the revocation. Sold means
 * paid — abandoned and cancelled payments are not sales. A revoked permit is invalid for every
 * catch and check (BR-01, ADR-0005); a refund, if any, is made outside the platform and noted in
 * the reason.
 */
@Injectable()
export class OrgPermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  /** Latest purchase first; the status filter is computed by the Warsaw day of now (ADR-0005). */
  async list(organizationId: string, query: ListOrgPermitsQueryDto): Promise<Page<OrgPermitDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;
    const now = this.clock.now();
    const where: Prisma.PermitWhereInput = {
      permitType: { organizationId },
      ...statusFilter(query.status, toDbDate(warsawDate(now))),
      number: query.q ? { contains: escapeLike(query.q), mode: 'insensitive' } : undefined,
    };
    const [total, permits] = await this.prisma.$transaction([
      this.prisma.permit.count({ where }),
      this.prisma.permit.findMany({
        where,
        include: WITH_TYPE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: await this.toDtos(permits, now), total, page, pageSize };
  }

  /**
   * Only a permit that can still be used (SCHEDULED, ACTIVE) is revoked; the row is locked, so
   * of two revocations one wins and the other sees REVOKED. `FOR NO KEY UPDATE`: the key does not
   * change, so a catch synced meanwhile (its FK check takes `KEY SHARE`) does not wait.
   */
  async revoke(
    organizationId: string,
    actorId: string,
    id: string,
    reason: string,
  ): Promise<OrgPermitDto> {
    const now = this.clock.now();
    const revoked = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT p."id" FROM "Permit" p
        JOIN "PermitType" t ON t."id" = p."permitTypeId"
        WHERE p."id" = ${id}::uuid AND t."organizationId" = ${organizationId}::uuid
        FOR NO KEY UPDATE OF p`;
      if (locked.length === 0) {
        throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
      }
      const permit = await tx.permit.findUniqueOrThrow({ where: { id }, include: WITH_TYPE });
      const status = effectivePermitStatus(
        {
          status: permit.status,
          validFrom: fromDbDate(permit.validFrom),
          validTo: fromDbDate(permit.validTo),
        },
        now,
      );
      if (!isRevocable(status)) {
        throw new DomainError(
          ErrorCode.PERMIT_NOT_REVOCABLE,
          { status },
          'Only a scheduled or active permit can be revoked',
        );
      }
      const updated = await tx.permit.update({
        where: { id },
        data: { status: PermitStatus.REVOKED, revokedAt: now, revokeReason: reason },
        include: WITH_TYPE,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'PERMIT_REVOKED',
        entity: 'Permit',
        entityId: id,
        diff: { organizationId, number: permit.number, from: status, reason },
      });
      return updated;
    });
    const [dto] = await this.toDtos([revoked], now);
    return dto!;
  }

  private async toDtos(permits: StoredPermit[], now: Date): Promise<OrgPermitDto[]> {
    const names = await this.users.findNames([...new Set(permits.map((permit) => permit.userId))]);
    return permits.map((permit) => {
      const validFrom = fromDbDate(permit.validFrom);
      const validTo = fromDbDate(permit.validTo);
      return {
        id: permit.id,
        number: permit.number,
        // The list holds paid and revoked permits only.
        status: effectivePermitStatus(
          { status: permit.status, validFrom, validTo },
          now,
        ) as SoldPermitStatus,
        validFrom,
        validTo,
        pricePaidGrosze: permit.pricePaidGrosze,
        permitType: permit.permitType,
        holder: names.get(permit.userId) ?? null,
        createdAt: permit.createdAt.toISOString(),
        revokedAt: permit.revokedAt?.toISOString() ?? null,
        revokeReason: permit.revokeReason,
      };
    });
  }
}

/** Sold permits, narrowed to one computed status; `today` is the Warsaw day as a `@db.Date`. */
function statusFilter(status: SoldPermitStatus | undefined, today: Date): Prisma.PermitWhereInput {
  switch (status) {
    case 'REVOKED':
      return { status: PermitStatus.REVOKED };
    case 'SCHEDULED':
      return { status: PermitStatus.PAID, validFrom: { gt: today } };
    case 'ACTIVE':
      return { status: PermitStatus.PAID, validFrom: { lte: today }, validTo: { gte: today } };
    case 'EXPIRED':
      return { status: PermitStatus.PAID, validTo: { lt: today } };
    case undefined:
      return { status: { in: [PermitStatus.PAID, PermitStatus.REVOKED] } };
  }
}
