import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export interface AuditEntry {
  actorId: string;
  /** UPPER_SNAKE_CASE, e.g. CLAIM_APPROVED. */
  action: string;
  entity: string;
  entityId: string;
  diff?: Prisma.InputJsonValue;
}

/** An entry of the RODO export: what the user did, without the diff. */
export interface ActorAuditEntry {
  action: string;
  entity: string;
  entityId: string;
  createdAt: Date;
}

/** Audit actions whose diff holds the invited address (`email`) — personal data of the invitee. */
const INVITATION_EMAIL_ACTIONS = ['INVITATION_CREATED', 'INVITATION_CANCELLED'];

/**
 * Owner of `AuditLog` (docs/07-security.md). An admin action records its entry in the
 * transaction of the action itself, so the change and its log commit or roll back together.
 * An action without a transaction of its own (a catalogue import, a data export) records
 * through `AuditInterceptor` once the handler has succeeded.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }

  /** For `AuditInterceptor`: the action has no transaction to join. */
  async recordNow(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }

  /**
   * What the user did, oldest first, for the RODO export. Without diffs: they name other
   * people (an invited address, a member's id).
   */
  listByActor(actorId: string): Promise<ActorAuditEntry[]> {
    return this.prisma.auditLog.findMany({
      where: { actorId },
      select: { action: true, entity: true, entityId: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Account deletion: the invitation entries keep who invited whom, but no longer the deleted
   * user's address. Returns how many entries were changed.
   */
  forgetInvitedEmail(tx: Prisma.TransactionClient, email: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE "AuditLog" SET "diff" = jsonb_set("diff", '{email}', 'null'::jsonb)
      WHERE "action" = ANY(${INVITATION_EMAIL_ACTIONS}::text[])
        AND "diff" ->> 'email' = ${email}`;
  }
}
