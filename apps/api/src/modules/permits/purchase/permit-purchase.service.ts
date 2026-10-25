import {
  ErrorCode,
  isDiscountEligible,
  latestPermitStart,
  PermitStatus,
  permitValidTo,
  warsawDate,
} from '@lowisko/shared';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import type { Env } from '../../../config/env';
import { PermitNumberService } from '../../../database/permit-number.service';
import { PrismaService } from '../../../database/prisma.service';
import type { PermitType, Prisma } from '../../../generated/prisma/client';
import { OrganizationsService } from '../../organizations/organizations.service';
import { type PaymentOutcomeHandler, PaymentsService } from '../../payments/payments.service';
import { UsersService } from '../../users/users.service';
import type { PurchasePermitDto, PurchasePermitResultDto } from '../dto/permit.dto';
import { MyPermitsService } from '../my-permits/my-permits.service';
import { fromDbDate, toDbDate } from '../permit-dates';

/**
 * Buying a permit (FR-08, scenario A): a PENDING_PAYMENT permit with its payment, sent to the
 * provider; the permit becomes PAID only when PaymentsModule reports a confirmed notification.
 */
@Injectable()
export class PermitPurchaseService implements OnModuleInit, PaymentOutcomeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly numbers: PermitNumberService,
    private readonly myPermits: MyPermitsService,
    private readonly clock: ClockService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.payments.setOutcomeHandler(this);
  }

  /**
   * The permit and its payment are written in one short transaction (the permit number may
   * hold a lock of the whole year until it commits, docs/04-data-model.md); the provider is
   * called after it. A free type has nothing to pay: its permit is PAID at once.
   */
  async purchase(userId: string, dto: PurchasePermitDto): Promise<PurchasePermitResultDto> {
    this.assertStartWindow(dto.validFrom);
    const user = await this.users.findById(userId);
    if (!user) {
      // The access token outlived the account (anonymised meanwhile).
      throw new DomainError(ErrorCode.UNAUTHENTICATED);
    }

    const { permitId, number, type, sessionId } = await this.prisma.$transaction(async (tx) => {
      const type = await this.lockTypeForSale(tx, dto.permitTypeId);
      const organization = await this.organizations.findPublicProfile(type.organizationId, tx);
      if (!type.isActive || !organization?.isActive) {
        throw new DomainError(
          ErrorCode.PERMIT_TYPE_INACTIVE,
          undefined,
          'The permit type is not on sale',
        );
      }
      if (!isDiscountEligible(type.discountKind, fromDbDate(user.birthDate), dto.validFrom)) {
        throw new DomainError(
          ErrorCode.DISCOUNT_NOT_ELIGIBLE,
          { discountKind: type.discountKind },
          'The buyer’s age does not qualify for the discount on validFrom',
        );
      }
      const free = type.priceGrosze === 0;
      const permit = await tx.permit.create({
        data: {
          number: await this.numbers.next(tx),
          userId,
          permitTypeId: type.id,
          validFrom: toDbDate(dto.validFrom),
          validTo: toDbDate(permitValidTo(dto.validFrom, type.durationDays)),
          status: free ? PermitStatus.PAID : PermitStatus.PENDING_PAYMENT,
          // Later price changes of the type do not touch a bought permit.
          pricePaidGrosze: type.priceGrosze,
          createdAt: this.clock.now(),
        },
      });
      const payment = free
        ? undefined
        : await this.payments.createPending(tx, {
            permitId: permit.id,
            amountGrosze: type.priceGrosze,
          });
      return { permitId: permit.id, number: permit.number, type, sessionId: payment?.sessionId };
    });

    const returnUrl = new URL('/payment/return', this.config.get('WEB_URL', { infer: true }));
    returnUrl.searchParams.set('permitId', permitId);
    const paymentUrl = sessionId
      ? await this.payments.start({
          sessionId,
          amountGrosze: type.priceGrosze,
          description: `${type.name} · ${number}`,
          email: user.email,
          returnUrl: returnUrl.toString(),
        })
      : returnUrl.toString();
    return { permit: await this.myPermits.get(userId, permitId), paymentUrl };
  }

  /**
   * A permit whose last day has passed (Warsaw) is not worth paying for any more: bought on
   * the last evening, its payment came after midnight.
   */
  async isStillPayable(tx: Prisma.TransactionClient, permitId: string): Promise<boolean> {
    const { validTo } = await tx.permit.findUniqueOrThrow({
      where: { id: permitId },
      select: { validTo: true },
    });
    return fromDbDate(validTo) >= warsawDate(this.clock.now());
  }

  /** The permit is paid only while it waits: the payment row lock orders this call. */
  async onPaymentSucceeded(tx: Prisma.TransactionClient, permitId: string): Promise<void> {
    const { count } = await tx.permit.updateMany({
      where: { id: permitId, status: PermitStatus.PENDING_PAYMENT },
      data: { status: PermitStatus.PAID },
    });
    if (count !== 1) {
      // A PENDING payment always belongs to a PENDING_PAYMENT permit; rolls the payment back.
      throw new Error(`Permit ${permitId} of a pending payment is not waiting for it`);
    }
  }

  async onPaymentsFailed(tx: Prisma.TransactionClient, permitIds: string[]): Promise<void> {
    await tx.permit.updateMany({
      where: { id: { in: permitIds }, status: PermitStatus.PENDING_PAYMENT },
      data: { status: PermitStatus.CANCELLED },
    });
  }

  /** BR-09 and the upper bound (docs/02-business-rules.md), by the Warsaw calendar day. */
  private assertStartWindow(validFrom: string): void {
    const today = warsawDate(this.clock.now());
    if (validFrom < today) {
      throw new DomainError(ErrorCode.PERMIT_START_IN_PAST, { today }, 'validFrom is before today');
    }
    const latest = latestPermitStart(today);
    if (validFrom > latest) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { validFrom: [`validFrom must not be after ${latest}`] } },
        'validFrom is too far ahead',
      );
    }
  }

  /**
   * Reads the type under FOR SHARE: a change of it running now (FOR UPDATE, T-12) is waited
   * for, so the sale takes its committed price and terms; a change starting now waits for
   * the sale and then counts its permit.
   */
  private async lockTypeForSale(tx: Prisma.TransactionClient, id: string): Promise<PermitType> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PermitType" WHERE "id" = ${id}::uuid FOR SHARE`;
    if (locked.length === 0) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit type not found');
    }
    return tx.permitType.findUniqueOrThrow({ where: { id } });
  }
}
