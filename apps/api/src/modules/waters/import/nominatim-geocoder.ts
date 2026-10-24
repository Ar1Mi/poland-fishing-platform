import { z } from 'zod';
import { type GeocodeResult, type Geocoder, GeocoderUnavailableError } from './geocoder';
import { MinIntervalLimiter } from './min-interval-limiter';

export interface NominatimOptions {
  baseUrl: string;
  /** Required by the Nominatim usage policy; without it every lookup is unavailable. */
  userAgent?: string;
  /** Usage policy: at most one request per second. */
  limiter?: MinIntervalLimiter;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const NUMBER = z.string().regex(/^-?\d+(\.\d+)?$/);
const searchResponse = z.array(z.looseObject({ lat: NUMBER, lon: NUMBER }));

/** OSM Nominatim `/search`, limited to Poland and to one request per second. */
export class NominatimGeocoder implements Geocoder {
  private readonly limiter: MinIntervalLimiter;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: NominatimOptions) {
    this.limiter = options.limiter ?? new MinIntervalLimiter(1000);
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async geocode(query: string): Promise<GeocodeResult | null> {
    const { userAgent } = this.options;
    if (!userAgent) {
      throw new GeocoderUnavailableError('geocoding is not configured (NOMINATIM_USER_AGENT)');
    }
    const url = new URL('search', this.options.baseUrl.replace(/\/?$/, '/'));
    url.search = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'pl',
    }).toString();

    const body = await this.limiter.schedule(async () => {
      let response: Response;
      try {
        response = await this.fetch(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        });
      } catch (error) {
        throw new GeocoderUnavailableError('geocoder did not respond', { cause: error });
      }
      if (!response.ok) {
        throw new GeocoderUnavailableError(`geocoder answered HTTP ${response.status}`);
      }
      try {
        return await response.json();
      } catch (error) {
        throw new GeocoderUnavailableError('geocoder answered with invalid JSON', { cause: error });
      }
    });

    const parsed = searchResponse.safeParse(body);
    if (!parsed.success) {
      throw new GeocoderUnavailableError('geocoder answered in an unexpected format');
    }
    const [first] = parsed.data;
    return first ? { lat: Number(first.lat), lng: Number(first.lon), raw: first } : null;
  }
}
