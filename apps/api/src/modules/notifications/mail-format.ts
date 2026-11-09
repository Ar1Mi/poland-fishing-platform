import type { DateOnly, Locale } from '@lowisko/shared';

// How emails write dates and amounts in the recipient's language. Plain-text emails: Intl's
// no-break spaces are kept, every mail client shows them.

const LANGUAGE_TAG: Readonly<Record<Locale, string>> = { pl: 'pl-PL', en: 'en-GB', ru: 'ru-RU' };

const dateFormats = new Map<Locale, Intl.DateTimeFormat>();
const priceFormats = new Map<Locale, Intl.NumberFormat>();

/** `2026-11-10` → `10 listopada 2026` / `10 November 2026` / `10 ноября 2026 г.` */
export function mailDate(locale: Locale, date: DateOnly): string {
  let format = dateFormats.get(locale);
  if (!format) {
    // A calendar day is read at UTC midnight, so the zone must be UTC too.
    format = new Intl.DateTimeFormat(LANGUAGE_TAG[locale], { dateStyle: 'long', timeZone: 'UTC' });
    dateFormats.set(locale, format);
  }
  return format.format(new Date(`${date}T00:00:00.000Z`));
}

/** Grosze as złoty: `2500` → `25,00 zł` / `PLN 25.00` / `25,00 PLN`. */
export function mailPrice(locale: Locale, grosze: number): string {
  let format = priceFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(LANGUAGE_TAG[locale], { style: 'currency', currency: 'PLN' });
    priceFormats.set(locale, format);
  }
  // Display only: an integer number of grosze divided by 100 has exactly two decimals.
  return format.format(grosze / 100);
}
