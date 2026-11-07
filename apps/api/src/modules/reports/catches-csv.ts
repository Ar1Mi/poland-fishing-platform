import { CatchSyncStatus, warsawDateTimeLocal } from '@lowisko/shared';
import type { ExportedCatch } from '../catches/report-catches/report-catches.service';
import { VIOLATION_LABEL } from '../catches/violation-labels';

// The catch export of an organization (FR-19) is made to open with a double click in a Polish
// Excel: `;` separates (`,` is the decimal comma there), the BOM tells it the text is UTF-8,
// lines end with CRLF (RFC 4180). Headers and values are Polish, times are Warsaw wall clock.

const SEPARATOR = ';';
const LINE_END = '\r\n';
const BOM = '\uFEFF';

const COLUMNS = [
  'Data',
  'Godzina',
  'Numer zezwolenia',
  'Łowisko',
  'Gatunek',
  'Długość (cm)',
  'Waga (g)',
  'Ryba',
  'Status',
  'Naruszenia',
] as const;

/** A leading character a spreadsheet would read as the start of a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;
/** A cell with these must be quoted, or it would split into more cells or lines. */
const NEEDS_QUOTES = /[";\r\n]/;

/**
 * One cell. Text is from the catalogue and the organization (names of waters, species), so a
 * value starting like a formula gets an apostrophe in front and is shown as text (OWASP: CSV
 * injection). Numbers are written as they are: they are ours and never negative.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) || text !== value ? `"${text.replaceAll('"', '""')}"` : text;
}

function line(cells: (string | number | null)[]): string {
  return cells.map(csvCell).join(SEPARATOR) + LINE_END;
}

/** The export: a header line and a line per catch, in the order given (earliest first). */
export function catchesCsv(catches: ExportedCatch[]): string {
  const lines = catches.map((fish) => {
    const [date = '', time = ''] = warsawDateTimeLocal(fish.caughtAt).split('T');
    return line([
      date,
      time,
      fish.permitNumber,
      fish.waterName,
      fish.speciesName,
      fish.lengthCm,
      fish.weightG,
      fish.kept ? 'zabrana' : 'wypuszczona',
      fish.status === CatchSyncStatus.ACCEPTED ? 'przyjęty' : 'odrzucony',
      fish.violations
        .map((violation) => `${VIOLATION_LABEL[violation.code]} (${violation.ruleId})`)
        .join(', ') || null,
    ]);
  });
  return BOM + line([...COLUMNS]) + lines.join('');
}
