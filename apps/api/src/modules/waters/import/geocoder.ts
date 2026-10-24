/** Position found for a geocode query; `raw` is the provider's answer, kept in GeocodeCache. */
export interface GeocodeResult {
  lat: number;
  lng: number;
  raw: unknown;
}

/** Looks a place up by text; null when the provider knows no such place. */
export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult | null>;
}

/** Injection token: Nominatim in the application, a fake in tests (external calls are banned). */
export const GEOCODER = Symbol('GEOCODER');

/**
 * The provider could not answer (not configured, network, HTTP error, unexpected body).
 * Unlike "not found" this is not cached: the next import asks again.
 */
export class GeocoderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GeocoderUnavailableError';
  }
}
