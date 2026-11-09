import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RulesModule } from '../rules/rules.module';
import { UsersModule } from '../users/users.module';
import { WatersModule } from '../waters/waters.module';
import { CatchPermitsService } from './catch-permits/catch-permits.service';
import { ExternalPermitsController } from './external-permits/external-permits.controller';
import { ExternalPermitsService } from './external-permits/external-permits.service';
import { InspectionPermitsService } from './inspection-permits/inspection-permits.service';
import { PermitExpiryReminderJob } from './mails/permit-expiry-reminder.job';
import { PermitMailsService } from './mails/permit-mails.service';
import { MyPermitsController } from './my-permits/my-permits.controller';
import { MyPermitsService } from './my-permits/my-permits.service';
import { OrgPermitsController } from './org-permits/org-permits.controller';
import { OrgPermitsService } from './org-permits/org-permits.service';
import { FakePaymentsController } from './payments/fake/fake-payments.controller';
import { PAYMENT_PROVIDER } from './payments/payment-provider';
import { createPaymentProvider } from './payments/payment-provider.factory';
import { P24PaymentsController } from './payments/p24/p24-payments.controller';
import { PaymentExpiryJob } from './payments/payment-expiry.job';
import { PaymentsService } from './payments/payments.service';
import { PermitPdfService } from './pdf/permit-pdf.service';
import {
  OrgPermitTypesController,
  PermitTypesController,
} from './permit-types/permit-types.controller';
import { PermitTypesService } from './permit-types/permit-types.service';
import { PermitPurchaseService } from './purchase/permit-purchase.service';
import { PermitsController } from './purchase/permits.controller';
import { QrTokenService } from './qr/qr-token.service';
import { ReportPermitsService } from './report-permits/report-permits.service';

/**
 * Permit types (T-12), the purchase and its payment (T-13, ADR-0012): the provider chosen by
 * `PAYMENTS_PROVIDER` (ADR-0004; Przelewy24 since T-14), notifications and the timeout.
 * The angler's permits with their QR token (ADR-0006) and PDF (T-15); the permits of catches
 * for the register (T-18) and of QR checks and protocols (T-19); the offline bundle of a permit
 * with the effective rules of its waters (T-21). External permits typed in by the angler with
 * their photo and offline bundle (T-22, FR-26). The permits an organization sold and their
 * revocation (T-23, FR-10). Sales and the organization's permits for its statistics (T-24).
 * Emails to the angler about a permit — bought, about to expire, revoked — and the reminder job
 * (T-25, FR-21).
 */
@Module({
  imports: [
    OrganizationsModule,
    WatersModule,
    AuditModule,
    UsersModule,
    RulesModule,
    NotificationsModule,
  ],
  controllers: [
    OrgPermitTypesController,
    PermitTypesController,
    PermitsController,
    MyPermitsController,
    OrgPermitsController,
    ExternalPermitsController,
    FakePaymentsController,
    P24PaymentsController,
  ],
  providers: [
    PermitTypesService,
    PermitPurchaseService,
    MyPermitsService,
    OrgPermitsService,
    ExternalPermitsService,
    QrTokenService,
    PermitPdfService,
    CatchPermitsService,
    InspectionPermitsService,
    ReportPermitsService,
    PaymentsService,
    PaymentExpiryJob,
    PermitMailsService,
    PermitExpiryReminderJob,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: createPaymentProvider,
    },
  ],
  exports: [
    CatchPermitsService,
    InspectionPermitsService,
    ExternalPermitsService,
    ReportPermitsService,
  ],
})
export class PermitsModule {}
