import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { WatersModule } from '../waters/waters.module';
import { MyPermitsController } from './my-permits/my-permits.controller';
import { MyPermitsService } from './my-permits/my-permits.service';
import {
  OrgPermitTypesController,
  PermitTypesController,
} from './permit-types/permit-types.controller';
import { PermitTypesService } from './permit-types/permit-types.service';
import { PermitPurchaseService } from './purchase/permit-purchase.service';
import { PermitsController } from './purchase/permits.controller';

/** Permit types (T-12) and the purchase (T-13); QR and PDF come with T-15. */
@Module({
  imports: [OrganizationsModule, WatersModule, AuditModule, UsersModule, PaymentsModule],
  controllers: [
    OrgPermitTypesController,
    PermitTypesController,
    PermitsController,
    MyPermitsController,
  ],
  providers: [PermitTypesService, PermitPurchaseService, MyPermitsService],
})
export class PermitsModule {}
