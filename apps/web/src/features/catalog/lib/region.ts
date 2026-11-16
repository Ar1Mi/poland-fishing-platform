import { isRegion, REGIONS, type Region } from '@lowisko/shared';
import type { TFunction } from 'i18next';

/**
 * Voivodeship name in the interface language (T-31). The API returns the stored Polish
 * name (`mazowieckie`); a value outside the dictionary is shown as it is.
 */
export function regionLabel(t: TFunction, region: string): string {
  return isRegion(region) ? t(`catalog.region.${region}`) : region;
}

/** All voivodeships with their names, in the alphabetical order of the interface language. */
export function regionOptions(t: TFunction, language: string): { value: Region; label: string }[] {
  const collator = new Intl.Collator(language);
  return REGIONS.map((value) => ({ value, label: regionLabel(t, value) })).sort((a, b) =>
    collator.compare(a.label, b.label),
  );
}
