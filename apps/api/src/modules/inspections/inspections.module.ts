import { Module } from '@nestjs/common';
import { CatchesModule } from '../catches/catches.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PermitsModule } from '../permits/permits.module';
import { UsersModule } from '../users/users.module';
import { OrgInspectionsController, VerifyController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

/**
 * Checks of permits by QR code and inspection protocols (T-19, ADR-0006). The permit comes from
 * PermitsModule, today's catches from CatchesModule, the holder from UsersModule.
 */
@Module({
  imports: [PermitsModule, CatchesModule, UsersModule, OrganizationsModule],
  controllers: [VerifyController, OrgInspectionsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
