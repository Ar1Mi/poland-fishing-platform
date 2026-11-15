import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';
import { runtimeCaching } from './pwa-runtime-caching';
import { caddyHeaderBlock, securityHeaders } from './security-headers';
import { tileOrigin, tileSource } from './src/shared/lib/map-tiles';

/** The repository root: `.env` and `.env.example` are shared with the API. */
const ENV_DIR = resolve(import.meta.dirname, '../..');

/** Where the build puts the Caddyfile snippet of the web image (T-30); not served itself. */
const CADDY_HEADERS_FILE = resolve(import.meta.dirname, 'dist-caddy/security-headers.caddy');

/** Writes the headers `vite preview` sends as the Caddy snippet, so both serve the same. */
function caddyHeaders(headers: Readonly<Record<string, string>>): Plugin {
  return {
    name: 'lowisko-caddy-headers',
    apply: 'build',
    closeBundle() {
      mkdirSync(resolve(CADDY_HEADERS_FILE, '..'), { recursive: true });
      writeFileSync(CADDY_HEADERS_FILE, caddyHeaderBlock(headers));
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_ variables of the shell (the Docker build) or of the repository's single .env, like
  // the API; the tile host is the same for the maps, the CSP and the service worker cache.
  const tiles = tileOrigin(tileSource(loadEnv(mode, ENV_DIR, 'VITE_')).url);
  const headers = securityHeaders(tiles);
  return {
    envDir: ENV_DIR,
    plugins: [
      react(),
      tailwindcss(),
      caddyHeaders(headers),
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
          runtimeCaching: runtimeCaching(tiles),
        },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          // Few files for the first screen (T-29): on a phone every request costs a round trip,
          // and over HTTP/1.1 at most six go at once. What the entry imports is three chunks
          // (React with the router, other libraries, the app); each lazy screen is its own; the code its screens share and Leaflet
          // are one chunk each.
          codeSplitting: {
            groups: [
              // The libraries of the first screen apart from the app's code: a release that
              // changes only the app keeps the browser's copy of the libraries.
              {
                name: 'react',
                tags: ['$initial'],
                test: /[\\/]node_modules[\\/].*[\\/](react|react-dom|scheduler|react-router)[\\/]/,
                priority: 50,
              },
              { name: 'vendor', tags: ['$initial'], test: /[\\/]node_modules[\\/]/, priority: 40 },
              { name: 'app', tags: ['$initial'], priority: 30 },
              {
                name: 'leaflet',
                test: /[\\/]node_modules[\\/].*(leaflet|markercluster)/,
                priority: 20,
              },
              { name: 'shared', minShareCount: 2, priority: 10 },
            ],
          },
        },
      },
    },
    server: {
      // Same origin as in production, where Caddy proxies /api (docs/08-testing-and-infra.md).
      // `vite preview` uses it too; the Playwright run points it at its own API.
      proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
    },
    preview: {
      // The production build as it will be served (security-headers.ts).
      headers: { ...headers },
      // The OWASP ZAP container reaches the preview of the host by this name (`pnpm security:zap`).
      allowedHosts: ['host.docker.internal'],
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Playwright: the scenarios (pnpm e2e), the ZAP baseline (pnpm security:zap), Lighthouse and
      // k6 (pnpm perf:lighthouse, pnpm perf:load).
      exclude: [...configDefaults.exclude, 'e2e/**', 'zap/**', 'perf/**'],
    },
  };
});
