import { type Bbox, formatBbox } from '@lowisko/shared';

/** Initial view: the whole of Poland; the map reports its real bounds once laid out. */
export const POLAND_BOUNDS: Bbox = { minLng: 14.07, minLat: 49.0, maxLng: 24.15, maxLat: 54.84 };
export const POLAND_BBOX = formatBbox(POLAND_BOUNDS);

/** `[[south, west], [north, east]]` as Leaflet takes bounds. */
export function toLatLngBounds({
  minLng,
  minLat,
  maxLng,
  maxLat,
}: Bbox): [[number, number], [number, number]] {
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function withPosition<T extends { lat: number | null; lng: number | null }>(
  waters: T[],
): (T & { lat: number; lng: number })[] {
  return waters.filter(
    (water): water is T & { lat: number; lng: number } => water.lat !== null && water.lng !== null,
  );
}
