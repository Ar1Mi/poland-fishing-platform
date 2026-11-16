// Map tiles (T-30). Plain module: the browser code, vite.config.ts and security-headers.ts all
// read it, so it never touches `import.meta.env` itself.

/**
 * Development default. The OSM tile policy allows no production load on this server, so the
 * production build sets VITE_MAP_TILE_URL (MapTiler, docs/08-testing-and-infra.md).
 */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface TileSource {
  /** Leaflet URL template: `{z}`, `{x}`, `{y}`, and `{r}` for retina; one host (no `{s}`). */
  url: string;
  /** HTML of the attribution control; it comes from the build configuration only. */
  attribution: string;
}

/** The configured source, or OSM when a variable is unset or empty. */
export function tileSource(env: {
  VITE_MAP_TILE_URL?: string;
  VITE_MAP_TILE_ATTRIBUTION?: string;
}): TileSource {
  const url = env.VITE_MAP_TILE_URL?.trim() || OSM_TILE_URL;
  tileOrigin(url);
  const attribution = env.VITE_MAP_TILE_ATTRIBUTION?.trim();
  if (attribution) {
    return { url, attribution };
  }
  if (url !== OSM_TILE_URL) {
    // Tile providers' terms (MapTiler, and OSM whose data they draw) require the attribution.
    throw new Error('VITE_MAP_TILE_ATTRIBUTION must be set with VITE_MAP_TILE_URL');
  }
  return { url, attribution: OSM_ATTRIBUTION };
}

/**
 * The origin the tiles come from: what the Content-Security-Policy allows and the service
 * worker caches. A template with `{s}` (several hosts) is refused: one origin is allowed.
 */
export function tileOrigin(url: string): string {
  const sample = url.replace(/\{[xyzr]\}/g, '0');
  if (/[{}]/.test(sample) || !URL.canParse(sample) || new URL(sample).protocol !== 'https:') {
    throw new Error(`VITE_MAP_TILE_URL must be an https URL template on one host: ${url}`);
  }
  return new URL(sample).origin;
}
