import {
  ErrorCode,
  PAYMENT_TIMEOUT_MINUTES,
  PaymentProviderKind,
  PaymentStatus,
} from '@lowisko/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { GLOBAL_PREFIX } from '../../common/http/global-prefix';
import type { Env } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import type { Payment, Prisma } from '../../generated/prisma/client';
import {
  PAYMENT_PROVIDER,
  type NewTransaction,
  type PaymentNotification,
  type PaymentProvider,
} from './payment-provider';

type Db = Prisma.TransactionClient;

/**
 * What a payment pays for (ADR-0012). PaymentsModule depends on no other module, so the
 * permit side registers itself (PermitsModule); every call runs in the transaction that
 * changes the payment, which holds the payment row lock.
 */
export interface PaymentOutcomeHandler {
  /** Whether it is still worth paying for: false fails the payment, unconfirmed. */
  isStillPayable(tx: Db, permitId: string): Promise<boolean>;
  onPaymentSucceeded(tx: Db, permitId: string): Promise<void>;
  /** Refused, abandoned, expired before it was paid, or never registered with the provider. */
  onPaymentsFailed(tx: Db, permitIds: string[]): Promise<void>;
}

/** Payments abandoned at once per sweep; the next run (a minute later) takes the rest. */
const EXPIRE_BATCH = 500;

/**
 * Confirmation calls the provider inside the transaction (see `processNotification`); Prisma's
 * default of 5 s for an interactive transaction is too short for a slow gateway.
 */
const CONFIRM_TRANSACTION_TIMEOUT_MS = 20_000;

/**
 * Owner of `Payment`. A payment becomes SUCCEEDED only through a notification the provider
 * vouches for (docs/07-security.md); the browser coming back proves nothing. Every change
 * takes the payment row with FOR UPDATE first, then the permit: one lock order for the
 * notification, the refusal and the timeout, so they never deadlock and never both win.
 */
@Injectable()
export class PaymentsService {
  private handler?: PaymentOutcomeHandler;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly clock: ClockService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(PaymentsService.name);
  }

  /** Called once by the module that sells what payments pay for (Observer). */
  setOutcomeHandler(handler: PaymentOutcomeHandler): void {
    if (this.handler) {
      throw new Error('A payment outcome handler is already registered');
    }
    this.handler = handler;
  }

  /** A PENDING payment of the permit, in the transaction that creates the permit. */
  async createPending(
    tx: Db,
    payment: { permitId: string; amountGrosze: number },
  ): Promise<{ sessionId: string }> {
    const sessionId = randomUUID();
    await tx.payment.create({
      data: {
        ...payment,
        sessionId,
        provider: this.provider.kind,
        // The timeout counts from here, on the same clock as the sweep.
        createdAt: this.clock.now(),
      },
    });
    return { sessionId };
  }

  /**
   * Registers the payment with the provider and returns where to send the buyer. Runs after
   * the permit transaction committed: no HTTP call inside it. A transaction the provider
   * refused cannot be paid, so it fails at once instead of waiting for the timeout.
   */
  async start(transaction: Omit<NewTransaction, 'statusUrl'>): Promise<string> {
    try {
      const { redirectUrl } = await this.provider.createTransaction({
        ...transaction,
        statusUrl: this.statusUrl(),
      });
      return redirectUrl;
    } catch (err) {
      try {
        await this.fail(transaction.sessionId);
      } catch (failure) {
        // The provider's error is the one to answer with; the timeout cancels the permit later.
        this.logger.error(
          { err: failure, sessionId: transaction.sessionId },
          'Failing a payment the provider did not register failed',
        );
      }
      throw err;
    }
  }

  /**
   * The provider's notification: the only way to SUCCEEDED. A repeated notification (P24
   * retries until it gets 200) or one for a payment that already failed changes nothing and
   * is not confirmed: P24 returns an unverified payment to the payer. A wrong amount →
   * PAYMENT_AMOUNT_MISMATCH, the payment stays PENDING until the timeout. A permit that
   * expired while its payment was pending (bought at 23:50 for today, paid after midnight)
   * fails the payment, unconfirmed.
   *
   * The payment and the permit are written first and the provider is confirmed last, still
   * inside the transaction: if anything fails, nothing is confirmed and nothing is stored,
   * and P24 notifies again. The payment row stays locked meanwhile, so the timeout cannot
   * cancel a payment whose money is being taken (the sweep skips locked rows).
   */
  async processNotification(body: unknown): Promise<PaymentStatus> {
    const notification = await this.provider.handleNotification(body);
    return this.prisma.$transaction(
      async (tx) => {
        const payment = await this.lock(tx, notification.sessionId);
        if (payment.status !== PaymentStatus.PENDING) {
          this.logger.info(
            { paymentId: payment.id, status: payment.status },
            'Notification for a payment that is no longer pending ignored',
          );
          return payment.status;
        }
        if (notification.amountGrosze !== payment.amountGrosze) {
          this.logger.error(
            {
              paymentId: payment.id,
              expectedGrosze: payment.amountGrosze,
              notifiedGrosze: notification.amountGrosze,
            },
            'Payment notification with a wrong amount rejected',
          );
          throw new DomainError(
            ErrorCode.PAYMENT_AMOUNT_MISMATCH,
            undefined,
            'The notified amount differs from the payment',
          );
        }
        const handler = this.outcomeHandler();
        const payable = await handler.isStillPayable(tx, payment.permitId);
        const status = payable ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status,
            providerOrderId: notification.providerOrderId,
            rawNotification: toJson(notification),
          },
        });
        if (!payable) {
          await handler.onPaymentsFailed(tx, [payment.permitId]);
          this.logger.warn(
            { paymentId: payment.id },
            'Payment notified after its permit expired: not confirmed',
          );
          return status;
        }
        await handler.onPaymentSucceeded(tx, payment.permitId);
        await this.provider.confirm(notification);
        this.logger.info({ paymentId: payment.id }, 'Payment succeeded');
        return status;
      },
      { timeout: CONFIRM_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * «Odrzuć» on the fake page, or «Zapłać» there, which goes through `processNotification`
   * like a P24 notification. P24 itself does not notify refusals: those time out.
   * `amountGrosze` lets a test notify a wrong amount; by default the stored one is paid.
   */
  async completeFake(
    sessionId: string,
    outcome: 'PAID' | 'REJECTED',
    amountGrosze?: number,
  ): Promise<PaymentStatus> {
    const payment = await this.prisma.payment.findUnique({ where: { sessionId } });
    // Outside the fake mode the route does not exist.
    if (this.provider.kind !== PaymentProviderKind.FAKE || !payment) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Payment not found');
    }
    if (outcome === 'REJECTED') {
      return this.fail(sessionId);
    }
    return this.processNotification({
      sessionId,
      providerOrderId: `FAKE-${randomUUID()}`,
      amountGrosze: amountGrosze ?? payment.amountGrosze,
    } satisfies PaymentNotification);
  }

  /**
   * Fails payments left PENDING for PAYMENT_TIMEOUT_MINUTES and cancels their permits;
   * returns how many. SKIP LOCKED: a payment being confirmed right now is left alone, the
   * next run sees it SUCCEEDED.
   */
  async expireAbandoned(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - PAYMENT_TIMEOUT_MINUTES * 60_000);
    return this.prisma.$transaction(async (tx) => {
      const abandoned = await tx.$queryRaw<Pick<Payment, 'id' | 'permitId'>[]>`
        SELECT "id", "permitId" FROM "Payment"
        WHERE "status" = 'PENDING' AND "createdAt" < ${cutoff}::timestamptz
        ORDER BY "createdAt"
        LIMIT ${EXPIRE_BATCH}
        FOR UPDATE SKIP LOCKED`;
      if (abandoned.length === 0) {
        return 0;
      }
      await tx.payment.updateMany({
        where: { id: { in: abandoned.map((payment) => payment.id) } },
        data: { status: PaymentStatus.FAILED },
      });
      await this.outcomeHandler().onPaymentsFailed(
        tx,
        abandoned.map((payment) => payment.permitId),
      );
      return abandoned.length;
    });
  }

  /** A PENDING payment → FAILED and its permit cancelled; any other status stays. */
  private async fail(sessionId: string): Promise<PaymentStatus> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.lock(tx, sessionId);
      if (payment.status !== PaymentStatus.PENDING) {
        return payment.status;
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      await this.outcomeHandler().onPaymentsFailed(tx, [payment.permitId]);
      this.logger.info({ paymentId: payment.id }, 'Payment failed');
      return PaymentStatus.FAILED;
    });
  }

  /**
   * Locks the payment row and reads it. Under READ COMMITTED the statement after the lock
   * sees what a transaction that held the lock before committed.
   */
  private async lock(tx: Db, sessionId: string): Promise<Payment> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Payment" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const id = locked[0]?.id;
    if (!id) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Payment not found');
    }
    return tx.payment.findUniqueOrThrow({ where: { id } });
  }

  private outcomeHandler(): PaymentOutcomeHandler {
    if (!this.handler) {
      throw new Error('No payment outcome handler registered (PermitsModule not loaded?)');
    }
    return this.handler;
  }

  /** P24 `urlStatus`; the fake page completes through its own route and never calls it. */
  private statusUrl(): string {
    const kind = this.provider.kind.toLowerCase();
    return new URL(
      `/${GLOBAL_PREFIX}/payments/${kind}/notification`,
      this.config.get('API_URL', { infer: true }),
    ).toString();
  }
}

function toJson(notification: PaymentNotification): Prisma.InputJsonValue {
  const { sessionId, providerOrderId, amountGrosze } = notification;
  return { sessionId, providerOrderId, amountGrosze };
}
