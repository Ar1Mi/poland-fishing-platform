import type { VitePWAOptions } from 'vite-plugin-pwa';

type RuntimeCaching = NonNullable<
  NonNullable<Partial<VitePWAOptions>['workbox']>['runtimeCaching']
>;

// Runtime caches of the service worker (ADR-0009, docs/06-frontend.md → «Офлайн»).
// The `urlPattern` functions are copied into sw.js as source text (workbox-build): they must not
// use anything defined outside them — a constant of this file would be undefined there, and the
// matcher would throw on every request (it did until T-30, pwa-runtime-caching.test.ts). A RegExp
// value is written into sw.js as a literal, so the tile host is passed as one.

/** `https://host` → a RegExp matching every URL of that origin. */
export const originPattern = (origin: string): RegExp =>
  new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/`);

/** `tileOrigin` — the host of the map tiles (VITE_MAP_TILE_URL). */
export function runtimeCaching(tileOrigin: string): RuntimeCaching {
  return [
    {
      // Public API answers the catalogue shows; the rest of the API is personal and never
      // cached. Card photos (T-23) are up to 5 MB each, so not in this JSON cache.
      urlPattern: ({ url, sameOrigin }) =>
        sameOrigin &&
        /^\/api\/v1\/waters(\/|$)/.test(url.pathname) &&
        !/^\/api\/v1\/waters\/[^/]+\/photo$/.test(url.pathname),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'catalog-api',
        expiration: { maxEntries: 200 },
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      // A new photo has a new URL (`?v=`): a stored one never goes stale.
      urlPattern: ({ url, sameOrigin }) =>
        sameOrigin && /^\/api\/v1\/waters\/[^/]+\/photo$/.test(url.pathname),
      handler: 'CacheFirst',
      options: {
        cacheName: 'water-photos',
        // Up to 5 MB each, in the quota the offline catches share: few, and the first to go.
        expiration: { maxEntries: 10, purgeOnQuotaError: true },
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      // The device's copy of species (`isProtected`, new species) must be the current
      // one: the network first, the cache only without it.
      urlPattern: ({ url, sameOrigin }) =>
        sameOrigin && /^\/api\/v1\/species(\/|$)/.test(url.pathname),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'species-api',
        networkTimeoutSeconds: 5,
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      urlPattern: originPattern(tileOrigin),
      handler: 'CacheFirst',
      options: {
        cacheName: 'map-tiles',
        expiration: { maxEntries: 500 },
        // Tiles come without CORS: an opaque answer (0) is all the cache can see.
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ];
}
