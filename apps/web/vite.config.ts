import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

/** Public API answers the catalogue shows; the rest of the API is personal and never cached. */
const WATERS_API = /^\/api\/v1\/waters(\/|$)/;
/** Card photos (T-23): up to 5 MB each, so not in the catalogue's JSON cache. */
const WATER_PHOTO = /^\/api\/v1\/waters\/[^/]+\/photo$/;
const SPECIES_API = /^\/api\/v1\/species(\/|$)/;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA of the angler (ADR-0009, docs/06-frontend.md → «Офлайн»). Catches and permits are kept
    // in IndexedDB, not in the service worker; it only serves the app shell, the catalogue and
    // the map tiles without network.
    VitePWA({
      // A new version takes over at once and the page reloads: the offline queue lives in
      // IndexedDB, so nothing recorded is lost.
      registerType: 'autoUpdate',
      // Registered from main.tsx (`virtual:pwa-register`).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Łowisko',
        short_name: 'Łowisko',
        description: 'Zezwolenia wędkarskie i rejestr połowów',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Toń 900 and the screen background (docs/10-design-system.md).
        theme_color: '#083F46',
        background_color: '#F3F6F4',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app shell and static files: precache.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Every route of the SPA opens offline; the API and its docs are never the app.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && WATERS_API.test(url.pathname) && !WATER_PHOTO.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalog-api',
              expiration: { maxEntries: 200 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // A new photo has a new URL (`?v=`): a stored one never goes stale.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && WATER_PHOTO.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'water-photos',
              expiration: { maxEntries: 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The device's copy of species (`isProtected`, new species) must be the current
            // one: the network first, the cache only without it.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && SPECIES_API.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'species-api',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500 },
              // Tiles come without CORS: an opaque answer (0) is all the cache can see.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Same origin as in production, where Caddy proxies /api (docs/08-testing-and-infra.md).
    // `vite preview` uses it too; the Playwright run points it at its own API.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Playwright scenarios (pnpm e2e).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
