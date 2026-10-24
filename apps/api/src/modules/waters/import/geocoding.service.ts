import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { GEOCODER, type Geocoder, GeocoderUnavailableError } from './geocoder';

export interface Position {
  lat: number;
  lng: number;
}

/**
 * Geocoding through `GeocodeCache`: a query is sent to the provider once, "not found"
 * included, so a repeated import makes no requests. Provider failures are not cached.
 */
@Injectable()
export class GeocodingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
  ) {}

  /**
   * null when the place is unknown; throws GeocoderUnavailableError when nobody answered.
   * `cachedOnly` answers from the cache and treats a miss as unavailable.
   */
  async locate(query: string, { cachedOnly = false } = {}): Promise<Position | null> {
    const key = normalizeQuery(query);
    const cached = await this.prisma.geocodeCache.findUnique({ where: { query: key } });
    if (cached) {
      return cached.lat !== null && cached.lng !== null
        ? { lat: cached.lat, lng: cached.lng }
        : null;
    }
    if (cachedOnly) {
      throw new GeocoderUnavailableError('skipped: the geocoder failed for the previous rows');
    }

    const result = await this.geocoder.geocode(key);
    const entry = {
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
      raw: (result?.raw ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    // upsert: two imports may look the same query up at once.
    await this.prisma.geocodeCache.upsert({
      where: { query: key },
      create: { query: key, ...entry },
      update: entry,
    });
    return result ? { lat: result.lat, lng: result.lng } : null;
  }
}

/** Cache key: case and spacing do not change what Nominatim finds. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}
