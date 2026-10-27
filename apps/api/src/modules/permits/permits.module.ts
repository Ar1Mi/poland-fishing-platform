import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { WatersModule } from '../waters/waters.module';
import { MyPermitsController } from './my-permits/my-permits.controller';
import { MyPermitsService } from './my-permits/my-permits.service';
import { FakePaymentProvider } from './payments/fake/fake-payment.provider';
import { FakePaymentsController } from './payments/fake/fake-payments.controller';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payments/payment-provider';
import { PaymentExpiryJob } from './payments/payment-expiry.job';
import { PaymentsService } from './payments/payments.service';
import {
  OrgPermitTypesController,
  PermitTypesController,
} from './permit-types/permit-types.controller';
import { PermitTypesService } from './permit-types/permit-types.service';
import { PermitPurchaseService } from './purchase/permit-purchase.service';
import { PermitsController } from './purchase/permits.controller';

/**
 * Permit types (T-12), the purchase and its payment (T-13, ADR-0012): the provider chosen by
 * `PAYMENTS_PROVIDER` (ADR-0004; Przelewy24 comes with T-14), notifications and the timeout.
 * QR and PDF come with T-15.
 */
@Module({
  imports: [OrganizationsModule, WatersModule, AuditModule, UsersModule],
  controllers: [
    OrgPermitTypesController,
    PermitTypesController,
    PermitsController,
    MyPermitsController,
    FakePaymentsController,
  ],
  providers: [
    PermitTypesService,
    PermitPurchaseService,
    MyPermitsService,
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
})
export class PermitsModule {}
