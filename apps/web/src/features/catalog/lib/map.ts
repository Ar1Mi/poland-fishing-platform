import { type Bbox, formatBbox } from '@lowisko/shared';

/** The part of Leaflet's `LatLngBounds` used here (keeps the helper testable without a map). */
export interface BoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

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

/** Map bounds in the `bbox` query format. */
export function bboxOf(bounds: BoundsLike): string {
  return formatBbox({
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth(),
  });
}

export function withPosition<T extends { lat: number | null; lng: number | null }>(
  waters: T[],
): (T & { lat: number; lng: number })[] {
  return waters.filter(
    (water): water is T & { lat: number; lng: number } => water.lat !== null && water.lng !== null,
  );
}
