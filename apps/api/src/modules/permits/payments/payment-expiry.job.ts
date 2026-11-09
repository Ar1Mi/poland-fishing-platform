import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { PaymentsService } from './payments.service';

/** How often abandoned payments are looked for; a permit is cancelled at most this late. */
export const PAYMENT_EXPIRY_INTERVAL_MS = 60_000;

/**
 * Cancels payments abandoned for PAYMENT_TIMEOUT_MINUTES (docs/03-architecture.md), on the
 * application's scheduler (`schedulingImports`, T-25; not under NODE_ENV=test). Several API
 * instances may run it at once, the sweep skips rows another one has locked.
 */
@Injectable()
export class PaymentExpiryJob {
  constructor(
    private readonly payments: PaymentsService,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(PaymentExpiryJob.name);
  }

  @Interval('payment-expiry', PAYMENT_EXPIRY_INTERVAL_MS)
  async run(): Promise<void> {
    try {
      const cancelled = await this.payments.expireAbandoned();
      if (cancelled > 0) {
        this.logger.info({ cancelled }, 'Abandoned payments cancelled');
      }
    } catch (err) {
      this.logger.error({ err }, 'Cancelling abandoned payments failed');
    }
  }
}
