import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { WatersModule } from '../waters/waters.module';
import { SpeciesController } from './species.controller';
import { SpeciesService } from './species.service';
import {
  AdminRulesController,
  OrgRulesController,
  WaterRulesController,
} from './species-rules.controller';
import { SpeciesRulesService } from './species-rules.service';

/**
 * Species and fishing rules (docs/03-architecture.md): the species dictionary (T-09) and the
 * rules of the three levels with their merge for a water (T-16, ADR-0008).
 */
@Module({
  imports: [OrganizationsModule, WatersModule, AuditModule],
  controllers: [SpeciesController, AdminRulesController, OrgRulesController, WaterRulesController],
  providers: [SpeciesService, SpeciesRulesService],
  exports: [SpeciesService, SpeciesRulesService],
})
export class RulesModule {}
