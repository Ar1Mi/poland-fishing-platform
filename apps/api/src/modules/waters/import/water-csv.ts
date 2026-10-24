import {
  isInBbox,
  isRegion,
  POLAND_BOUNDS,
  type Region,
  WaterSource,
  WaterType,
} from '@lowisko/shared';
import { CsvError, parse } from 'csv-parse/sync';
import { z } from 'zod';

/** Columns of `data/waters/*.csv` (docs/08-testing-and-infra.md → «Данные каталога»). */
export const WATER_CSV_COLUMNS = [
  'source',
  'sourceRef',
  'name',
  'type',
  'region',
  'externalOwnerName',
  'externalInfoUrl',
  'lat',
  'lng',
  'geocodeQuery',
] as const;
export type WaterCsvColumn = (typeof WATER_CSV_COLUMNS)[number];

/** Most data rows one file may hold; the catalogue of a region is far below it. */
export const WATER_CSV_MAX_ROWS = 5000;

/** The file as a whole is unusable: not CSV, wrong header, too many rows. */
export class WaterCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaterCsvFormatError';
  }
}

/** `row` is the CSV record number with the header as 1, so the first data row is 2. */
export type WaterCsvRecord =
  { row: number; values: Record<WaterCsvColumn, string> } | { row: number; error: string };

export function parseWaterCsv(content: Buffer | string): WaterCsvRecord[] {
  let records: string[][];
  try {
    records = parse(content, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      // A wrong field count is a problem of that row, not of the whole file.
      relax_column_count: true,
    });
  } catch (error) {
    if (error instanceof CsvError) {
      throw new WaterCsvFormatError(`not a valid CSV: ${error.message}`);
    }
    throw error;
  }

  const [header, ...rows] = records;
  if (!header) {
    throw new WaterCsvFormatError('the file is empty');
  }
  checkHeader(header);
  if (rows.length > WATER_CSV_MAX_ROWS) {
    throw new WaterCsvFormatError(`at most ${WATER_CSV_MAX_ROWS} rows per file`);
  }

  return rows.map((fields, index) => {
    const row = index + 2;
    if (fields.length !== header.length) {
      return { row, error: `expected ${header.length} fields, got ${fields.length}` };
    }
    const values = Object.fromEntries(header.map((column, i) => [column, fields[i] ?? '']));
    return { row, values: values as Record<WaterCsvColumn, string> };
  });
}

function checkHeader(header: string[]): void {
  const missing = WATER_CSV_COLUMNS.filter((column) => !header.includes(column));
  const unknown = header.filter(
    (column) => !(WATER_CSV_COLUMNS as readonly string[]).includes(column),
  );
  const duplicated = header.filter((column, i) => header.indexOf(column) !== i);
  const problems = [
    missing.length ? `missing columns: ${missing.join(', ')}` : '',
    unknown.length ? `unknown columns: ${unknown.join(', ')}` : '',
    duplicated.length ? `duplicated columns: ${duplicated.join(', ')}` : '',
  ].filter(Boolean);
  if (problems.length) {
    throw new WaterCsvFormatError(`invalid header (${problems.join('; ')})`);
  }
}

/** A row ready for the upsert; without coordinates it carries the geocoding query. */
export interface WaterCsvRow {
  source: WaterSource;
  sourceRef: string;
  name: string;
  type: WaterType;
  region: Region;
  externalOwnerName: string | null;
  externalInfoUrl: string | null;
  position: { lat: number; lng: number } | { geocodeQuery: string };
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const emptyToNull = (value: string) => (value === '' ? null : value);

// USER is a suggestion of an angler (FR-25): it comes from the application, not from a file.
const IMPORT_SOURCES = Object.values(WaterSource).filter((source) => source !== 'USER');

const rowSchema = z
  .object({
    source: z.enum(IMPORT_SOURCES as [WaterSource, ...WaterSource[]], {
      error: `must be one of ${IMPORT_SOURCES.join(', ')}`,
    }),
    sourceRef: z.string().min(1, 'is required').max(100),
    name: z.string().min(1, 'is required').max(200),
    type: z.enum(WaterType, { error: `must be one of ${Object.values(WaterType).join(', ')}` }),
    region: z.string().refine(isRegion, 'must be a voivodeship in lower case, e.g. mazowieckie'),
    externalOwnerName: z.string().max(200).transform(emptyToNull),
    externalInfoUrl: z
      .string()
      .max(500)
      .refine(
        (value) =>
          value === '' || (URL.canParse(value) && /^https?:$/.test(new URL(value).protocol)),
        'must be an http(s) URL',
      )
      .transform(emptyToNull),
    lat: z
      .string()
      .refine((value) => value === '' || DECIMAL.test(value), 'must be a decimal number'),
    lng: z
      .string()
      .refine((value) => value === '' || DECIMAL.test(value), 'must be a decimal number'),
    geocodeQuery: z.string().max(300),
  })
  .superRefine((row, ctx) => {
    if ((row.lat === '') !== (row.lng === '')) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'lat and lng go together' });
    } else if (row.lat === '' && row.geocodeQuery === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['geocodeQuery'],
        message: 'is required when lat and lng are empty',
      });
    } else if (
      row.lat !== '' &&
      DECIMAL.test(row.lat) &&
      DECIMAL.test(row.lng) &&
      !isInBbox(Number(row.lat), Number(row.lng), POLAND_BOUNDS)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['lat'],
        message: 'lat/lng must lie in Poland (are they swapped?)',
      });
    }
  });

/** Validates one record; the error names every bad field, e.g. `region: must be ...`. */
export function validateWaterRow(
  values: Record<WaterCsvColumn, string>,
): { row: WaterCsvRow } | { error: string } {
  const result = rowSchema.safeParse(values);
  if (!result.success) {
    return {
      error: result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    };
  }
  const { lat, lng, geocodeQuery, ...fields } = result.data;
  return {
    row: {
      ...fields,
      position: lat !== '' ? { lat: Number(lat), lng: Number(lng) } : { geocodeQuery },
    },
  };
}
