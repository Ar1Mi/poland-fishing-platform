import { Module } from '@nestjs/common';
import { PermitsModule } from '../permits/permits.module';
import { RulesModule } from '../rules/rules.module';
import { UsersModule } from '../users/users.module';
import { WatersModule } from '../waters/waters.module';
import { CatchContextLoader } from './catch-context.loader';
import { CatchesController, MyCatchesController } from './catches.controller';
import { CatchesService } from './catches.service';
import { ExternalRegisterController } from './register/external-register.controller';
import { ExternalRegisterService } from './register/external-register.service';
import { RegisterPdfService } from './register/register-pdf.service';

/**
 * The register of catches (T-18): batch sync with the CatchValidator of `packages/shared`
 * (ADR-0009), the angler's register, changes within the BR-07 window, the season register of
 * an external permit as a PDF (T-22). Exports the service for the catches of today that an
 * inspection shows (T-19).
 */
@Module({
  imports: [PermitsModule, RulesModule, WatersModule, UsersModule],
  controllers: [CatchesController, MyCatchesController, ExternalRegisterController],
  providers: [CatchesService, CatchContextLoader, ExternalRegisterService, RegisterPdfService],
  exports: [CatchesService],
})
export class CatchesModule {}
