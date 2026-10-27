import { DISCOUNT_AGE, DiscountKind, type DateOnly, WARSAW_TIME_ZONE } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { MyPermitDto } from '../dto/permit.dto';

// apps/api/assets: the same depth from src/ (tests, tsx) and dist/ (build).
const FONTS = join(__dirname, '../../../../assets/fonts');
const REGULAR = join(FONTS, 'Onest-Regular.ttf');
const BOLD = join(FONTS, 'Onest-Bold.ttf');

export interface PermitPdfInput {
  permit: MyPermitDto;
  holder: { firstName: string; lastName: string; birthDate: DateOnly; anglerCardNo: string | null };
  /** Waters of the permit type, already in display order. */
  waterNames: string[];
  verifyUrl: string;
  generatedAt: Date;
}

export interface PermitPdfContent {
  title: string;
  number: string;
  rows: [label: string, value: string][];
  watersLabel: string;
  waterNames: string[];
  qrCaption: string;
  verifyUrl: string;
  footer: string;
}

// The PDF is a Polish document for Polish waters; it is not translated with the interface.
const DISCOUNT_LABEL: Record<DiscountKind, string | null> = {
  NONE: null,
  JUNIOR: `ulgowe — do ${DISCOUNT_AGE.JUNIOR_BELOW} lat`,
  SENIOR: `ulgowe — od ${DISCOUNT_AGE.SENIOR_FROM} lat`,
};

/** `2026-10-06` → `06.10.2026`. */
const polishDate = (date: DateOnly): string => date.split('-').reverse().join('.');

// pdfkit measures text by the font's glyphs; Intl puts (narrow) no-break spaces into amounts and
// times, so they become plain spaces rather than depend on the glyphs being there.
const plainSpaces = (text: string): string => text.replace(/\s/g, ' ');

const price = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const generatedAtFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: WARSAW_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

/** What the PDF says, apart from how it is drawn (unit-tested; PDF text is not readable back). */
export function permitPdfContent({
  permit,
  holder,
  waterNames,
  verifyUrl,
  generatedAt,
}: PermitPdfInput): PermitPdfContent {
  const discount = DISCOUNT_LABEL[permit.permitType.discountKind];
  const rows: [string, string][] = [
    ['Posiadacz', `${holder.firstName} ${holder.lastName}`],
    ['Data urodzenia', polishDate(holder.birthDate)],
  ];
  if (holder.anglerCardNo) {
    rows.push(['Nr karty wędkarskiej', holder.anglerCardNo]);
  }
  rows.push(
    ['Wydające', permit.organization.name],
    ['Rodzaj', discount ? `${permit.permitType.name} (${discount})` : permit.permitType.name],
    ['Ważne od', polishDate(permit.validFrom)],
    ['Ważne do', `${polishDate(permit.validTo)} włącznie`],
    ['Opłata', plainSpaces(price.format(permit.pricePaidGrosze / 100))],
  );
  return {
    title: 'Zezwolenie na amatorski połów ryb',
    number: permit.number,
    rows,
    watersLabel: 'Łowiska',
    waterNames,
    qrCaption: 'Zeskanuj, aby sprawdzić ważność zezwolenia',
    verifyUrl,
    footer:
      `Wygenerowano ${plainSpaces(generatedAtFormat.format(generatedAt))} w serwisie Łowisko. ` +
      'Ważność zezwolenia potwierdza wyłącznie sprawdzenie kodu QR online.',
  };
}

const PAGE_MARGIN = 50;
const QR_SIZE = 170;
const INK = '#1a2b25';
const MUTED = '#5b6b65';

/** Draws the permit on one A4 page: details on the left, the QR code (vector) on the right. */
@Injectable()
export class PermitPdfService {
  render(input: PermitPdfInput): Promise<Buffer> {
    const content = permitPdfContent(input);
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: {
        Title: `${content.title} ${content.number}`,
        Producer: 'Łowisko',
        Creator: 'Łowisko',
        CreationDate: input.generatedAt,
      },
    });
    doc.registerFont('regular', REGULAR);
    doc.registerFont('bold', BOLD);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = PAGE_MARGIN;
    const qrLeft = doc.page.width - PAGE_MARGIN - QR_SIZE;
    const textWidth = qrLeft - left - 24;

    doc.fillColor(INK).font('bold').fontSize(20).text(content.title, left, PAGE_MARGIN, {
      width: textWidth,
    });
    doc.moveDown(0.3).font('regular').fontSize(14).fillColor(MUTED).text(content.number, {
      width: textWidth,
    });

    doc.moveDown(1.2);
    for (const [label, value] of content.rows) {
      doc
        .font('regular')
        .fontSize(9)
        .fillColor(MUTED)
        .text(label.toUpperCase(), { width: textWidth });
      doc.font('bold').fontSize(12).fillColor(INK).text(value, { width: textWidth });
      doc.moveDown(0.5);
    }

    doc.font('regular').fontSize(9).fillColor(MUTED).text(content.watersLabel.toUpperCase(), {
      width: textWidth,
    });
    doc.font('regular').fontSize(11).fillColor(INK);
    for (const name of content.waterNames) {
      doc.text(`• ${name}`, { width: textWidth });
    }
    const textBottom = doc.y;

    drawQr(doc, content.verifyUrl, qrLeft, PAGE_MARGIN, QR_SIZE);
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(MUTED)
      .text(content.qrCaption, qrLeft, PAGE_MARGIN + QR_SIZE + 8, {
        width: QR_SIZE,
        align: 'center',
      });

    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(content.footer, left, Math.max(textBottom, doc.y) + 32, {
        width: doc.page.width - 2 * PAGE_MARGIN,
      });

    doc.end();
    return done;
  }
}

/** The QR code as filled squares: sharp at any zoom and in print, unlike an embedded bitmap. */
function drawQr(doc: PDFKit.PDFDocument, text: string, x: number, y: number, size: number): void {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const cell = size / (modules.size + 2 * quietZone);
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) {
        doc.rect(x + (col + quietZone) * cell, y + (row + quietZone) * cell, cell, cell);
      }
    }
  }
  doc.fillColor('#000000').fill();
}
