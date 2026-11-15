// Security headers of the web app (T-28, docs/07-security.md → «XSS»). `vite preview` sends them
// (Playwright and the ZAP baseline run against it); in production Caddy sends the same (T-30).
// Not for `vite dev`: its HMR client and React refresh need inline scripts.

/** Map tiles (react-leaflet); the service worker also fetches them (`connect-src`). */
const TILE_ORIGIN = 'https://tile.openstreetmap.org';

const CONTENT_SECURITY_POLICY = {
  'default-src': ["'self'"],
  // Bundled scripts only: no inline script, no eval.
  'script-src': ["'self'"],
  // Inline styles stay allowed: libraries insert <style> tags (Leaflet, scroll lock of dialogs).
  // A style cannot run code; the scripts above are what XSS needs.
  'style-src': ["'self'", "'unsafe-inline'"],
  // `data:` — the QR code and Leaflet icons; `blob:` — photos fetched with the token.
  'img-src': ["'self'", 'data:', 'blob:', TILE_ORIGIN],
  'font-src': ["'self'"],
  // The API is on the same origin (/api is proxied).
  'connect-src': ["'self'", TILE_ORIGIN],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  // No framing of the app (clickjacking of «Zapłać», «Unieważnij»).
  'frame-ancestors': ["'none'"],
} as const;

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': Object.entries(CONTENT_SECURITY_POLICY)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; '),
  'X-Content-Type-Options': 'nosniff',
  // Email links carry one-time tokens in the URL (also the <meta> in index.html).
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  // The catch and inspection forms ask for the position; nothing else is used.
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
