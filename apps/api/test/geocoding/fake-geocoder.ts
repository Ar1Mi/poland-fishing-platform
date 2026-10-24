import type { GeocodeResult, Geocoder } from '../../src/modules/waters/import/geocoder';
import { GeocoderUnavailableError } from '../../src/modules/waters/import/geocoder';

/**
 * Geocoder of integration tests: knows the places in `places` (keys as the cache stores
 * them, lower case), answers null for the rest; `unavailable` simulates a provider outage.
 */
export class FakeGeocoder implements Geocoder {
  readonly queries: string[] = [];
  unavailable = false;

  constructor(private readonly places: Record<string, { lat: number; lng: number }> = {}) {}

  geocode(query: string): Promise<GeocodeResult | null> {
    this.queries.push(query);
    if (this.unavailable) {
      return Promise.reject(new GeocoderUnavailableError('geocoder answered HTTP 503'));
    }
    const place = this.places[query];
    return Promise.resolve(place ? { ...place, raw: { display_name: query } } : null);
  }
}
