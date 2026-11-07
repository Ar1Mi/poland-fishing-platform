import type { ExportedCatch } from '../catches/report-catches/report-catches.service';
import { catchesCsv, csvCell } from './catches-csv';

const fish = (data: Partial<ExportedCatch> = {}): ExportedCatch => ({
  // 17:20 in Warsaw (summer time).
  caughtAt: new Date('2026-10-06T15:20:00.000Z'),
  permitNumber: 'ZW-2026-000123',
  waterName: 'Zalew Zegrzyński',
  speciesName: 'Szczupak',
  lengthCm: 62,
  weightG: 2150,
  kept: true,
  status: 'ACCEPTED',
  violations: [],
  ...data,
});

const HEADER =
  'Data;Godzina;Numer zezwolenia;Łowisko;Gatunek;Długość (cm);Waga (g);Ryba;Status;Naruszenia';

describe('catchesCsv', () => {
  it('starts with the BOM and the Polish header, lines end with CRLF', () => {
    const csv = catchesCsv([]);

    expect(csv).toBe(`\uFEFF${HEADER}\r\n`);
  });

  it('writes a catch on the Warsaw day and time, in grams and whole centimetres', () => {
    const csv = catchesCsv([fish()]);

    expect(csv.split('\r\n')[1]).toBe(
      '2026-10-06;17:20;ZW-2026-000123;Zalew Zegrzyński;Szczupak;62;2150;zabrana;przyjęty;',
    );
  });

  it('puts a catch after midnight in Warsaw on the next day', () => {
    // 22:30 UTC on 6 October is 00:30 on 7 October in Warsaw.
    const csv = catchesCsv([fish({ caughtAt: new Date('2026-10-06T22:30:00.000Z') })]);

    expect(csv.split('\r\n')[1]).toMatch(/^2026-10-07;00:30;/);
  });

  it('leaves the weight empty when it was not given, and says the fish was released', () => {
    const csv = catchesCsv([fish({ weightG: null, kept: false })]);

    expect(csv.split('\r\n')[1]).toContain(';62;;wypuszczona;');
  });

  it('lists the violations of a rejected catch in one cell', () => {
    const csv = catchesCsv([
      fish({
        status: 'REJECTED',
        violations: ['poniżej wymiaru ochronnego (BR-02)', 'ponad dzienny limit sztuk (BR-04)'],
      }),
    ]);

    expect(csv.split('\r\n')[1]).toMatch(
      /;odrzucony;poniżej wymiaru ochronnego \(BR-02\), ponad dzienny limit sztuk \(BR-04\)$/,
    );
  });

  it('keeps a value with the separator or quotes in one cell', () => {
    const csv = catchesCsv([fish({ waterName: 'Staw "Duży"; Dolny' })]);

    expect(csv.split('\r\n')[1]).toContain(';"Staw ""Duży""; Dolny";');
  });
});

describe('csvCell', () => {
  it.each(['=HYPERLINK("http://example.test")', '+48', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'shows %j as text, not as a formula',
    (value) => {
      const cell = csvCell(value);

      expect(cell.startsWith(`"'`)).toBe(true);
    },
  );

  it('quotes a value with a line break', () => {
    expect(csvCell('Wisła\nodcinek')).toBe('"Wisła\nodcinek"');
  });

  it('writes numbers and empty values as they are', () => {
    expect(csvCell(2150)).toBe('2150');
    expect(csvCell(null)).toBe('');
    expect(csvCell('Szczupak')).toBe('Szczupak');
  });
});
