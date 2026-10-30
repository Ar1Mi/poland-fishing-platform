/** Name of a species in the interface language; Polish for any other. */
export function speciesName(
  species: { namePl: string; nameEn: string; nameRu: string },
  language: string | undefined,
): string {
  return language === 'en' ? species.nameEn : language === 'ru' ? species.nameRu : species.namePl;
}

/** A day of a closed period (`MM-DD`) in the interface language, e.g. `1 stycznia`. */
export function formatMonthDay(monthDay: string, locale: string): string {
  const [month = 1, day = 1] = monthDay.split('-').map(Number);
  // Any non-leap year: only the day and the month are shown.
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2001, month - 1, day)),
  );
}

/** A weight in whole grams, in kilograms from 1 kg (`5 kg`, `2,5 kg`), else in grams. */
export function formatWeight(grams: number, locale: string): string {
  return grams >= 1000
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'kilogram',
        maximumFractionDigits: 3,
      }).format(grams / 1000)
    : new Intl.NumberFormat(locale, { style: 'unit', unit: 'gram' }).format(grams);
}
