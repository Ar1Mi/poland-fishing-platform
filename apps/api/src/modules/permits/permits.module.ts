import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { WatersModule } from '../waters/waters.module';
import {
  OrgPermitTypesController,
  PermitTypesController,
} from './permit-types/permit-types.controller';
import { PermitTypesService } from './permit-types/permit-types.service';

/** Permit types (T-12); purchase, QR and PDF come with T-13…T-15. */
@Module({
  imports: [OrganizationsModule, WatersModule, AuditModule],
  controllers: [OrgPermitTypesController, PermitTypesController],
  providers: [PermitTypesService],
})
export class PermitsModule {}
