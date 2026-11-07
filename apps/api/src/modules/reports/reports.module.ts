import { Module } from '@nestjs/common';
import { CatchesModule } from '../catches/catches.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PermitsModule } from '../permits/permits.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Statistics and the catch export of an organization (T-24, FR-19). Reads only through the
 * services PermitsModule and CatchesModule export for it; the catches of the organization are
 * found by joining the relation of its permits that PermitsModule hands over.
 */
@Module({
  imports: [PermitsModule, CatchesModule, OrganizationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
