import type { MyPermit } from '../../permits/api/usePurchase';

/** A water to record a catch on, with the permit that covers it (BR-01). */
export interface CatchPlace {
  /** `permitId:waterId`, the value of the select. */
  key: string;
  permitId: string;
  waterId: string;
  waterName: string;
  /** The permit type, shown only when two active permits cover the same water. */
  permitName: string | null;
}

const placeKey = (permitId: string, waterId: string) => `${permitId}:${waterId}`;

/** Waters of the given permits, by name; a water covered by two of them is offered once per permit. */
export function catchPlaces(permits: MyPermit[]): CatchPlace[] {
  const places = permits.flatMap((permit) =>
    permit.waters.map((water) => ({
      key: placeKey(permit.id, water.id),
      permitId: permit.id,
      waterId: water.id,
      waterName: water.name,
      permitName: permit.permitType.name,
    })),
  );
  const coverage = new Map<string, number>();
  for (const place of places) {
    coverage.set(place.waterId, (coverage.get(place.waterId) ?? 0) + 1);
  }
  return places
    .map((place) => (coverage.get(place.waterId) === 1 ? { ...place, permitName: null } : place))
    .sort((a, b) => a.waterName.localeCompare(b.waterName, 'pl') || a.key.localeCompare(b.key));
}

/** The last water and species, preset on the next catch (docs/06-frontend.md, NFR-06). */
export interface LastChoice {
  place: string;
  speciesId: string;
}

// Not sensitive: ids of a water, a permit and a species (frontend rules allow localStorage).
const LAST_CHOICE_KEY = 'lowisko.catch.last';

export function readLastChoice(): LastChoice | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_CHOICE_KEY) ?? 'null') as unknown;
    return typeof value === 'object' &&
      value !== null &&
      typeof (value as LastChoice).place === 'string' &&
      typeof (value as LastChoice).speciesId === 'string'
      ? (value as LastChoice)
      : null;
  } catch {
    // Blocked storage or a broken value: nothing is preset.
    return null;
  }
}

export function rememberChoice(choice: LastChoice): void {
  try {
    localStorage.setItem(LAST_CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Not remembered; the next form starts empty.
  }
}

/** A weight in whole grams as editable kilograms (`1,25`) that `parseWeightKg` reads back. */
export function formatWeightInput(grams: number | null, locale: string): string {
  // Division only for display: the weight is sent as whole grams.
  return grams === null
    ? ''
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false }).format(
        grams / 1000,
      );
}

/** A length in whole centimetres, e.g. `64 cm`. */
export function formatLength(cm: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'centimeter' }).format(cm);
}
