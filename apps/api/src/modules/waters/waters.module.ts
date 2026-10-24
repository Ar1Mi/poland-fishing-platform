import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GEOCODER } from './import/geocoder';
import { GeocodingService } from './import/geocoding.service';
import { NominatimGeocoder } from './import/nominatim-geocoder';
import { WaterImportService } from './import/water-import.service';
import { AdminWatersController, WatersController } from './waters.controller';
import { WatersService } from './waters.service';

/** Catalogue (T-09) and its CSV import with geocoding (T-10); claims (T-11) come next. */
@Module({
  imports: [OrganizationsModule],
  controllers: [WatersController, AdminWatersController],
  providers: [
    WatersService,
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
