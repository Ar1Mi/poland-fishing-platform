import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { WatersController } from './waters.controller';
import { WatersService } from './waters.service';

/** Catalogue (T-09); CSV import (T-10) and claims (T-11) come next. */
@Module({
  imports: [OrganizationsModule],
  controllers: [WatersController],
  providers: [WatersService],
  exports: [WatersService],
})
export class WatersModule {}
