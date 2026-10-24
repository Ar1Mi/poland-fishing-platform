import { Module } from '@nestjs/common';
import { SpeciesController } from './species.controller';
import { SpeciesService } from './species.service';

/** Species and fishing rules (docs/03-architecture.md); T-09 adds the species dictionary. */
@Module({
  controllers: [SpeciesController],
  providers: [SpeciesService],
  exports: [SpeciesService],
})
export class RulesModule {}
