import { join } from 'node:path';
import { type DateOnly, WARSAW_TIME_ZONE } from '@lowisko/shared';

// What the PDF documents (the permit, T-15; the register, T-22) share: the font and how dates
// are written. They are Polish documents for Polish waters, not translated with the interface;
// the fonts built into PDF have no Polish letters, so Onest (OFL) is embedded.

// apps/api/assets: the same depth from src/ (tests, tsx) and dist/ (build).
const FONTS = join(__dirname, '../../../assets/fonts');

export const PDF_FONTS = {
  regular: join(FONTS, 'Onest-Regular.ttf'),
  bold: join(FONTS, 'Onest-Bold.ttf'),
} as const;

/** `2026-10-06` → `06.10.2026`. */
export const polishDate = (date: DateOnly): string => date.split('-').reverse().join('.');

// pdfkit measures text by the font's glyphs; Intl puts (narrow) no-break spaces into amounts and
// times, so they become plain spaces rather than depend on the glyphs being there.
export const plainSpaces = (text: string): string => text.replace(/\s/g, ' ');

const dateTimeFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: WARSAW_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

/** An instant as Warsaw wall clock, e.g. `6.10.2026, 17:20`: when a document was generated. */
export const polishDateTime = (instant: Date): string =>
  plainSpaces(dateTimeFormat.format(instant));

/** Collects a pdfkit document into one buffer; call before drawing, then `doc.end()`. */
export function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
