import { Module } from '@nestjs/common';
import { PermitsModule } from '../permits/permits.module';
import { RulesModule } from '../rules/rules.module';
import { WatersModule } from '../waters/waters.module';
import { CatchContextLoader } from './catch-context.loader';
import { CatchesController, MyCatchesController } from './catches.controller';
import { CatchesService } from './catches.service';

/**
 * The register of catches (T-18): batch sync with the CatchValidator of `packages/shared`
 * (ADR-0009), the angler's register, changes within the BR-07 window. Exports the service for
 * the catches of today that an inspection shows (T-19).
 */
@Module({
  imports: [PermitsModule, RulesModule, WatersModule],
  controllers: [CatchesController, MyCatchesController],
  providers: [CatchesService, CatchContextLoader],
  exports: [CatchesService],
})
export class CatchesModule {}
