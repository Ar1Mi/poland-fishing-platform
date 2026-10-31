/** Calendar date of an instant in Europe/Warsaw, in the interface language (docs/06-frontend.md). */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Europe/Warsaw' }).format(
    new Date(iso),
  );
}

/** A price in whole grosze as money in the interface language, e.g. `25,00 zł`. */
export function formatPrice(grosze: number, locale: string): string {
  // Division only for display: amounts are stored and sent as whole grosze.
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN' }).format(grosze / 100);
}

/** A price in whole grosze as an editable amount in złoty (`25,50`), without the currency. */
export function formatPriceInput(grosze: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(grosze / 100);
}

/** Wall-clock time of an instant in Warsaw, e.g. `14:05`. */
export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(
    new Date(iso),
  );
}

/** Date and wall-clock time of an instant in Warsaw, e.g. `7 paź 2026, 23:59`. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw',
  }).format(new Date(iso));
}

/** The Warsaw calendar day of an instant with its weekday, e.g. `wtorek, 6 października`. */
export function formatDayWithWeekday(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Warsaw',
  }).format(new Date(iso));
}
