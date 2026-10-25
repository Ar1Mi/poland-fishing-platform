import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env';
import { PaymentsService } from './payments.service';

/** How often abandoned payments are looked for; a permit is cancelled at most this late. */
export const PAYMENT_EXPIRY_INTERVAL_MS = 60_000;

/**
 * Cancels payments abandoned for PAYMENT_TIMEOUT_MINUTES (docs/03-architecture.md). A plain
 * interval, no scheduler library: one job. Several API instances may run it at once, the
 * sweep skips rows another one has locked.
 */
@Injectable()
export class PaymentExpiryJob implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(PaymentExpiryJob.name);
  }

  onApplicationBootstrap(): void {
    // Tests run the sweep themselves after moving the clock; a timer would race them.
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.run(), PAYMENT_EXPIRY_INTERVAL_MS);
    // Never the reason the process stays alive.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

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
