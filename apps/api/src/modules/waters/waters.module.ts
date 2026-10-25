import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AdminClaimsController, OrgClaimsController } from './claims/claims.controller';
import { ClaimsService } from './claims/claims.service';
import { GEOCODER } from './import/geocoder';
import { GeocodingService } from './import/geocoding.service';
import { NominatimGeocoder } from './import/nominatim-geocoder';
import { WaterImportService } from './import/water-import.service';
import { AdminWatersController, WatersController } from './waters.controller';
import { WatersService } from './waters.service';

/** Catalogue (T-09), its CSV import with geocoding (T-10) and water claims (T-11). */
@Module({
  imports: [OrganizationsModule, AuditModule],
  controllers: [
    WatersController,
    AdminWatersController,
    OrgClaimsController,
    AdminClaimsController,
  ],
  providers: [
    WatersService,
    ClaimsService,
    WaterImportService,
    GeocodingService,
    {
      provide: GEOCODER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new NominatimGeocoder({
          baseUrl: config.get('NOMINATIM_URL', { infer: true }),
          userAgent: config.get('NOMINATIM_USER_AGENT', { infer: true }),
        }),
    },
  ],
  exports: [WatersService],
})
export class WatersModule {}
