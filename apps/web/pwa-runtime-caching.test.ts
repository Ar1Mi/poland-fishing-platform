import { describe, expect, it } from 'vitest';
import { originPattern, runtimeCaching } from './pwa-runtime-caching';

type Matcher = (options: { url: URL; sameOrigin: boolean }) => boolean;

/** What the service worker runs: the matcher rebuilt from its source, with nothing in scope. */
function asInSw(matcher: unknown): Matcher {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the point of the test
  const build = new Function(`return (${String(matcher)});`) as () => Matcher;
  return build();
}

const APP = 'https://lowisko.example';
const caches = runtimeCaching('https://api.maptiler.com');

/** Name of the cache that takes `href`; the first matching route wins, as in Workbox. */
function cacheFor(href: string): string | undefined {
  const url = new URL(href);
  return (
    caches.find(({ urlPattern }) =>
      urlPattern instanceof RegExp
        ? urlPattern.test(href)
        : asInSw(urlPattern)({ url, sameOrigin: url.origin === APP }),
    )?.options?.cacheName ?? undefined
  );
}

describe('runtime caches of the service worker', () => {
  it('match without anything from the build config in scope (T-30)', () => {
    expect(cacheFor(`${APP}/api/v1/waters?bbox=14,49,24,55`)).toBe('catalog-api');
    expect(cacheFor(`${APP}/api/v1/waters/2b1c/rules`)).toBe('catalog-api');
    expect(cacheFor(`${APP}/api/v1/waters/2b1c/photo?v=3`)).toBe('water-photos');
    expect(cacheFor(`${APP}/api/v1/species`)).toBe('species-api');
    expect(cacheFor('https://api.maptiler.com/maps/streets-v2/256/5/17/10.png?key=k')).toBe(
      'map-tiles',
    );
  });

  it('never cache the personal API or another host', () => {
    expect(cacheFor(`${APP}/api/v1/me/permits`)).toBeUndefined();
    expect(cacheFor(`${APP}/api/v1/watersheds`)).toBeUndefined();
    expect(cacheFor('https://evil.example/api/v1/waters')).toBeUndefined();
    expect(cacheFor('https://api.maptiler.com.evil.example/5/17/10.png')).toBeUndefined();
  });
});

describe('originPattern', () => {
  it('matches the origin exactly, dots included', () => {
    const pattern = originPattern('https://tile.openstreetmap.org');

    expect(pattern.test('https://tile.openstreetmap.org/5/17/10.png')).toBe(true);
    expect(pattern.test('https://tileXopenstreetmap.org/5/17/10.png')).toBe(false);
  });
});
