import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

export interface AuditEntry {
  actorId: string;
  /** UPPER_SNAKE_CASE, e.g. CLAIM_APPROVED. */
  action: string;
  entity: string;
  entityId: string;
  diff?: Prisma.InputJsonValue;
}

/**
 * Owner of `AuditLog` (docs/07-security.md). An admin action records its entry in the
 * transaction of the action itself, so the change and its log commit or roll back together.
 * The interceptor for actions without a transaction of their own comes with T-26.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }
}
