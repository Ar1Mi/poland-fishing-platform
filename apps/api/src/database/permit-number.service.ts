import { Injectable } from '@nestjs/common';
import { warsawDate } from '@lowisko/shared';
import { ClockService } from '../common/clock/clock.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

/**
 * Permit numbers `ZW-{YYYY}-{000001}` (docs/04-data-model.md). Numbering restarts every
 * calendar year in Europe/Warsaw; the per-year PostgreSQL sequence lives behind the
 * `next_permit_number` SQL function from the init migration.
 */
@Injectable()
export class PermitNumberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Pass the transaction client when the permit is created in a transaction. */
  async next(db: Prisma.TransactionClient = this.prisma): Promise<string> {
    const year = Number(warsawDate(this.clock.now()).slice(0, 4));
    const rows = await db.$queryRaw<{ number: string }[]>`
      SELECT next_permit_number(${year}::integer) AS number`;
    const number = rows[0]?.number;
    if (!number) {
      throw new Error('next_permit_number returned no row');
    }
    return number;
  }
}
