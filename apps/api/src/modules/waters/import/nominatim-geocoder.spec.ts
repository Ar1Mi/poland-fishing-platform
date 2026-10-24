import { GeocoderUnavailableError } from './geocoder';
import { MinIntervalLimiter } from './min-interval-limiter';
import { NominatimGeocoder } from './nominatim-geocoder';

const noWait = new MinIntervalLimiter(0);

function geocoderReturning(response: Response | Error, userAgent: string | undefined) {
  const fetch = jest.fn<Promise<Response>, Parameters<typeof globalThis.fetch>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  const geocoder = new NominatimGeocoder({
    baseUrl: 'https://nominatim.example/',
    userAgent,
    limiter: noWait,
    fetch,
  });
  return { geocoder, fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('NominatimGeocoder', () => {
  it('asks /search for one Polish result with the User-Agent and returns its position', async () => {
    const hit = { lat: '52.4875', lon: '21.0102', display_name: 'Zalew Zegrzyński' };
    const { geocoder, fetch } = geocoderReturning(json([hit]), 'test/1.0');

    await expect(geocoder.geocode('Zalew Zegrzyński, mazowieckie')).resolves.toEqual({
      lat: 52.4875,
      lng: 21.0102,
      raw: hit,
    });

    const [url, init] = fetch.mock.calls[0]!;
    const requested = url as URL;
    expect(requested.origin + requested.pathname).toBe('https://nominatim.example/search');
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      q: 'Zalew Zegrzyński, mazowieckie',
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'pl',
    });
    expect(init?.headers).toMatchObject({ 'User-Agent': 'test/1.0' });
  });

  it('keeps a path of the base URL', async () => {
    const fetch = jest.fn(() => Promise.resolve(json([])));
    const geocoder = new NominatimGeocoder({
      baseUrl: 'https://osm.example/nominatim',
      userAgent: 'test/1.0',
      limiter: noWait,
      fetch,
    });

    await geocoder.geocode('x');

    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(
      /^https:\/\/osm\.example\/nominatim\/search\?/,
    );
  });

  it('returns null when nothing is found', async () => {
    const { geocoder } = geocoderReturning(json([]), 'test/1.0');

    await expect(geocoder.geocode('Nieistniejące jezioro')).resolves.toBeNull();
  });

  it.each([
    ['no User-Agent is configured', json([]), undefined],
    ['the request fails', new Error('ECONNREFUSED'), 'test/1.0'],
    ['the answer is an HTTP error', json({ error: 'busy' }, 503), 'test/1.0'],
    ['the answer is not JSON', new Response('<html>', { status: 200 }), 'test/1.0'],
    ['the answer has an unexpected shape', json([{ lat: 'north' }]), 'test/1.0'],
  ])('reports the geocoder as unavailable when %s', async (_case, response, userAgent) => {
    const { geocoder } = geocoderReturning(response, userAgent);

    await expect(geocoder.geocode('Zalew')).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });

  it('does not call Nominatim without a User-Agent', async () => {
    const { geocoder, fetch } = geocoderReturning(json([]), undefined);

    await geocoder.geocode('Zalew').catch(() => undefined);

    expect(fetch).not.toHaveBeenCalled();
  });
});
