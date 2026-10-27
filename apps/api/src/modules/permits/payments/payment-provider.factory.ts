import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import { FakePaymentProvider } from './fake/fake-payment.provider';
import { Przelewy24Provider } from './p24/przelewy24.provider';
import type { PaymentProvider } from './payment-provider';

/** The provider chosen by `PAYMENTS_PROVIDER` (ADR-0004). */
export function createPaymentProvider(config: ConfigService<Env, true>): PaymentProvider {
  switch (config.get('PAYMENTS_PROVIDER', { infer: true })) {
    case 'fake':
      return new FakePaymentProvider(config.get('WEB_URL', { infer: true }));
    case 'p24':
      // validateEnv requires all of them with p24.
      return new Przelewy24Provider({
        baseUrl: config.get('P24_BASE_URL', { infer: true }),
        merchantId: config.get('P24_MERCHANT_ID', { infer: true }),
        posId: config.get('P24_POS_ID', { infer: true }),
        apiKey: config.get('P24_API_KEY', { infer: true }),
        crc: config.get('P24_CRC', { infer: true }),
      });
  }
}
