/**
 * Lists longer than this get a filter by name (an organization of a PZW district has hundreds
 * of waters): shorter ones are read at a glance.
 */
export const NAME_FILTER_FROM = 8;

/** Lower case without diacritics, so «zegrzynski» finds «Zegrzyński» in a client-side filter. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase();
}

/** Whether `text` contains `query` (trimmed), ignoring case and Polish diacritics. */
export function matchesQuery(text: string, query: string): boolean {
  const folded = foldText(query.trim());
  return folded === '' || foldText(text).includes(folded);
}
