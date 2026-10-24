// Water catalogue (FR-06). Used by the API query validation and by the web filters and map.

/** Voivodeships as stored in `FishingWater.region` (lower-case Polish names). */
export const REGIONS = [
  'dolnośląskie',
  'kujawsko-pomorskie',
  'lubelskie',
  'lubuskie',
  'łódzkie',
  'małopolskie',
  'mazowieckie',
  'opolskie',
  'podkarpackie',
  'podlaskie',
  'pomorskie',
  'śląskie',
  'świętokrzyskie',
  'warmińsko-mazurskie',
  'wielkopolskie',
  'zachodniopomorskie',
] as const;
export type Region = (typeof REGIONS)[number];

export function isRegion(value: unknown): value is Region {
  return REGIONS.includes(value as Region);
}

/**
 * Most waters one `GET /waters` returns. The list is not paginated (the map needs every
 * marker in view); above the limit the response says `truncated` and the map asks to zoom in.
 */
export const WATERS_LIST_LIMIT = 2000;

export const WATER_QUERY_MAX_LENGTH = 100;

/** Map viewport in the `bbox=minLng,minLat,maxLng,maxLat` query format. */
export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Extreme points of Poland: the map's initial view and the import's coordinate check. */
export const POLAND_BOUNDS: Bbox = { minLng: 14.07, minLat: 49.0, maxLng: 24.15, maxLat: 54.84 };

export function isInBbox(lat: number, lng: number, box: Bbox): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Parses `minLng,minLat,maxLng,maxLat`; null when malformed, out of range or with min > max.
 * A box across the antimeridian is not supported (the catalogue covers Poland).
 */
export function parseBbox(value: string): Bbox | null {
  const parts = value.split(',');
  if (parts.length !== 4 || !parts.every((part) => NUMBER.test(part.trim()))) {
    return null;
  }
  const [minLng, minLat, maxLng, maxLat] = parts.map(Number) as [number, number, number, number];
  const lngOk = (lng: number) => lng >= -180 && lng <= 180;
  const latOk = (lat: number) => lat >= -90 && lat <= 90;
  if (!lngOk(minLng) || !lngOk(maxLng) || !latOk(minLat) || !latOk(maxLat)) {
    return null;
  }
  if (minLng > maxLng || minLat > maxLat) {
    return null;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Formats a viewport for the query, rounded to 5 decimals (about 1 m) so small map moves
 * do not produce a new query key; the box is clamped to valid coordinates.
 */
export function formatBbox({ minLng, minLat, maxLng, maxLat }: Bbox): string {
  const round = (n: number, limit: number) =>
    String(Math.round(Math.min(Math.max(n, -limit), limit) * 1e5) / 1e5);
  return [round(minLng, 180), round(minLat, 90), round(maxLng, 180), round(maxLat, 90)].join(',');
}
