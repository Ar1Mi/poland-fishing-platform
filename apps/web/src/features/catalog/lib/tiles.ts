import { tileSource } from '../../../shared/lib/map-tiles';

/** Tiles of both maps: VITE_MAP_TILE_URL of the build, OSM in development (T-30). */
export const TILES = tileSource(import.meta.env);
