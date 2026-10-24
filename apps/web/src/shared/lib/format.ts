/** Calendar date of an instant in Europe/Warsaw, in the interface language (docs/06-frontend.md). */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Europe/Warsaw' }).format(
    new Date(iso),
  );
}
