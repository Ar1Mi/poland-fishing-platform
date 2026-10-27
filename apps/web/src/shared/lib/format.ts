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
