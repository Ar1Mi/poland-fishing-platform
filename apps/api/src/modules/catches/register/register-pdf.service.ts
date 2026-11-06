import { CatchErrorCode, CatchSyncStatus, warsawDate } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  PDF_FONTS,
  collectPdf,
  plainSpaces,
  polishDate,
  polishDateTime,
} from '../../../common/pdf/pdf-text';
import type { ExternalPermitDto } from '../../permits/dto/external-permit.dto';
import type { CatchDto } from '../dto/catch.dto';

export interface RegisterPdfInput {
  season: number;
  permit: ExternalPermitDto;
  holder: { firstName: string; lastName: string; anglerCardNo: string | null };
  /** Kept fish of the season on the permit, earliest first (`keptOnExternalPermit`). */
  catches: CatchDto[];
  /** Polish names of the species, by id. */
  speciesNames: Map<string, string>;
  generatedAt: Date;
}

export interface RegisterPdfContent {
  title: string;
  subtitle: string;
  rows: [label: string, value: string][];
  watersLabel: string;
  waterNames: string[];
  columns: string[];
  /** One row per fish, cells in the order of `columns`. */
  lines: string[][];
  /** Said instead of the table when the season has no kept fish. */
  empty: string | null;
  total: string;
  footer: string;
}

/**
 * Why a fish did not meet the rules, as the owner of the water reads it. The register is a Polish
 * document for Polish waters, not translated with the interface.
 */
const VIOLATION_LABEL: Record<CatchErrorCode, string> = {
  PERMIT_NOT_ACTIVE: 'poza terminem zezwolenia',
  PERMIT_WATER_MISMATCH: 'łowisko spoza zezwolenia',
  BELOW_MIN_LENGTH: 'poniżej wymiaru ochronnego',
  CLOSED_SEASON: 'okres ochronny',
  DAILY_COUNT_LIMIT: 'ponad dzienny limit sztuk',
  DAILY_WEIGHT_LIMIT: 'ponad dzienny limit wagi',
  PROTECTED_SPECIES: 'gatunek chroniony',
  CATCH_IN_FUTURE: 'data w przyszłości',
  WEIGHT_REQUIRED: 'brak wagi',
};

// Kilograms only for display: the weight is stored as whole grams.
const kilograms = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3, useGrouping: false });

/** What the register says, apart from how it is drawn (unit-tested; PDF text is not readable back). */
export function registerPdfContent({
  season,
  permit,
  holder,
  catches,
  speciesNames,
  generatedAt,
}: RegisterPdfInput): RegisterPdfContent {
  const rows: [string, string][] = [['Wędkarz', `${holder.firstName} ${holder.lastName}`]];
  if (holder.anglerCardNo) {
    rows.push(['Nr karty wędkarskiej', holder.anglerCardNo]);
  }
  rows.push(['Zezwolenie wydał', permit.issuerName]);
  if (permit.number) {
    rows.push(['Nr zezwolenia', permit.number]);
  }
  rows.push(['Ważne', `${polishDate(permit.validFrom)} – ${polishDate(permit.validTo)}`]);

  // Each fish on its own row (user decision): its length and weight stay visible, as on screen.
  const lines = catches.map((fish, index) => [
    String(index + 1),
    polishDate(warsawDate(new Date(fish.caughtAt))),
    fish.water.name,
    speciesNames.get(fish.speciesId) ?? '',
    '1',
    String(fish.lengthCm),
    fish.weightG === null ? '—' : kilograms.format(fish.weightG / 1000),
    fish.status === CatchSyncStatus.REJECTED
      ? `naruszenie: ${fish.violations.map((violation) => VIOLATION_LABEL[violation.code]).join(', ')}`
      : '',
  ]);
  const violating = catches.filter((fish) => fish.status === CatchSyncStatus.REJECTED).length;

  return {
    title: 'Rejestr połowu ryb',
    subtitle: `Sezon ${season}`,
    rows,
    watersLabel: 'Łowiska',
    waterNames: permit.waters.map((water) => water.name),
    columns: [
      'Lp.',
      'Data',
      'Łowisko',
      'Gatunek',
      'Ilość (szt.)',
      'Długość (cm)',
      'Waga (kg)',
      'Uwagi',
    ],
    lines,
    empty: lines.length === 0 ? `Brak ryb zabranych na tym zezwoleniu w sezonie ${season}.` : null,
    total:
      `Razem ryb zabranych: ${catches.length} szt.` +
      (violating > 0 ? `, w tym z naruszeniem zasad: ${violating} szt.` : ''),
    footer:
      `Wygenerowano ${polishDateTime(generatedAt)} w serwisie Łowisko. Rejestr obejmuje ryby ` +
      'zabrane, zapisane przez wędkarza; uwaga „naruszenie” oznacza połów niezgodny z ogólnymi ' +
      'zasadami amatorskiego połowu ryb w chwili zapisu.',
  };
}

const PAGE_MARGIN = 40;
const INK = '#1a2b25';
const MUTED = '#5b6b65';
const RULE = '#c9d3cf';
const CELL_PADDING = 3;
/** Column widths in points; together the text width of A4 with the margins (515). */
const COLUMN_WIDTHS = [24, 58, 112, 78, 40, 46, 42, 115];

/** Draws the register on A4 pages: the header once, the table with its head on every page. */
@Injectable()
export class RegisterPdfService {
  render(input: RegisterPdfInput): Promise<Buffer> {
    const content = registerPdfContent(input);
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: {
        Title: `${content.title} — ${content.subtitle}`,
        Producer: 'Łowisko',
        Creator: 'Łowisko',
        CreationDate: input.generatedAt,
      },
    });
    doc.registerFont('regular', PDF_FONTS.regular);
    doc.registerFont('bold', PDF_FONTS.bold);
    const done = collectPdf(doc);
    const width = doc.page.width - 2 * PAGE_MARGIN;

    doc.fillColor(INK).font('bold').fontSize(18).text(content.title, { width });
    doc.font('regular').fontSize(12).fillColor(MUTED).text(content.subtitle, { width });
    doc.moveDown(0.8);
    for (const [label, value] of content.rows) {
      doc.font('regular').fontSize(9).fillColor(MUTED).text(`${label.toUpperCase()}: `, {
        width,
        continued: true,
      });
      doc.font('bold').fontSize(10).fillColor(INK).text(value);
    }
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(MUTED)
      .text(`${content.watersLabel.toUpperCase()}: `, {
        width,
        continued: true,
      });
    doc.font('regular').fontSize(10).fillColor(INK).text(content.waterNames.join(', '));
    doc.moveDown(1);

    if (content.empty) {
      doc.font('regular').fontSize(11).fillColor(INK).text(content.empty, PAGE_MARGIN, doc.y, {
        width,
      });
    } else {
      drawTable(doc, content.columns, content.lines);
      doc.moveDown(0.6);
      doc.font('bold').fontSize(10).fillColor(INK).text(content.total, PAGE_MARGIN, doc.y, {
        width,
      });
    }

    doc.moveDown(1.5);
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(MUTED)
      .text(plainSpaces(content.footer), PAGE_MARGIN, doc.y, {
        width,
      });

    doc.end();
    return done;
  }
}

/** The table, breaking pages between rows; the head is repeated on each page. */
function drawTable(doc: PDFKit.PDFDocument, columns: string[], lines: string[][]): void {
  const bottom = doc.page.height - PAGE_MARGIN;
  const heightOf = (cells: string[], font: string) => {
    doc.font(font).fontSize(8.5);
    return (
      Math.max(
        ...cells.map((cell, index) =>
          doc.heightOfString(cell, { width: COLUMN_WIDTHS[index]! - 2 * CELL_PADDING }),
        ),
      ) +
      2 * CELL_PADDING
    );
  };
  const drawRow = (cells: string[], font: string, color: string) => {
    const height = heightOf(cells, font);
    const top = doc.y;
    let x = PAGE_MARGIN;
    doc.font(font).fontSize(8.5).fillColor(color);
    cells.forEach((cell, index) => {
      const cellWidth = COLUMN_WIDTHS[index]!;
      doc.text(cell, x + CELL_PADDING, top + CELL_PADDING, { width: cellWidth - 2 * CELL_PADDING });
      x += cellWidth;
    });
    doc
      .moveTo(PAGE_MARGIN, top + height)
      .lineTo(x, top + height)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();
    doc.x = PAGE_MARGIN;
    doc.y = top + height;
  };

  drawRow(columns, 'bold', MUTED);
  for (const line of lines) {
    if (doc.y + heightOf(line, 'regular') > bottom) {
      doc.addPage();
      drawRow(columns, 'bold', MUTED);
    }
    drawRow(line, 'regular', INK);
  }
}
