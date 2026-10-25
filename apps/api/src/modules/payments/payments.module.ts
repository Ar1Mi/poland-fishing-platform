import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { FakePaymentProvider } from './fake/fake-payment.provider';
import { FakePaymentsController } from './fake/fake-payments.controller';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentExpiryJob } from './payment-expiry.job';
import { PaymentsService } from './payments.service';

/**
 * Payments (ADR-0004): the provider chosen by `PAYMENTS_PROVIDER`, the `Payment` table, the
 * notifications and the timeout. Depends on no other module; what a payment pays for
 * registers a PaymentOutcomeHandler (PermitsModule). Przelewy24 comes with T-14.
 */
@Module({
  controllers: [FakePaymentsController],
  providers: [
    PaymentsService,
    PaymentExpiryJob,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PaymentProvider => {
        switch (config.get('PAYMENTS_PROVIDER', { infer: true })) {
          case 'fake':
            return new FakePaymentProvider(config.get('WEB_URL', { infer: true }));
        }
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
