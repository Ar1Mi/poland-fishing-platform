/** `J. K.`: what a public QR check shows of the holder (FR-28, docs/07-security.md). */
export function holderInitials(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((name) => {
      // NFC first: a decomposed «Ż» is «Z» plus a combining dot. Then the first code point, not
      // UTF-16 unit, and Polish casing (`ł` → `Ł`).
      const [first = ''] = name.normalize('NFC').trim();
      return first ? `${first.toLocaleUpperCase('pl')}.` : '';
    })
    .filter(Boolean)
    .join(' ');
}
