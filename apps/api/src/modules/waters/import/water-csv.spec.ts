import {
  parseWaterCsv,
  validateWaterRow,
  WATER_CSV_COLUMNS,
  WATER_CSV_MAX_ROWS,
  type WaterCsvColumn,
  WaterCsvFormatError,
} from './water-csv';

const HEADER = WATER_CSV_COLUMNS.join(',');
const BOM = '\uFEFF';

// `containing()` is typed as `any`; narrowing it keeps the assertions type-checked.
const containing = (fields: object): unknown => expect.objectContaining(fields);

const valid: Record<WaterCsvColumn, string> = {
  source: 'RZGW',
  sourceRef: 'WA-123',
  name: 'Zalew Zegrzyński',
  type: 'RESERVOIR',
  region: 'mazowieckie',
  externalOwnerName: 'RZGW Warszawa',
  externalInfoUrl: 'https://www.gov.pl/web/wody-polskie',
  lat: '',
  lng: '',
  geocodeQuery: 'Zalew Zegrzyński, mazowieckie',
};

describe('parseWaterCsv', () => {
  it('maps fields to columns and numbers rows with the header as 1', () => {
    const csv = `${HEADER}\nRZGW,WA-1,"Jezioro, Duże",LAKE,mazowieckie,,,52.1,21.2,\nPZW,P-2,Staw,POND,mazowieckie,,,,,"Staw, Radom"\n`;

    const records = parseWaterCsv(csv);

    expect(records).toEqual([
      { row: 2, values: containing({ sourceRef: 'WA-1', name: 'Jezioro, Duże' }) },
      {
        row: 3,
        values: containing({ sourceRef: 'P-2', geocodeQuery: 'Staw, Radom' }),
      },
    ]);
  });

  it('accepts columns in any order, a BOM, CRLF and trims fields', () => {
    const header = [...WATER_CSV_COLUMNS].reverse().join(',');
    const csv = `${BOM}${header}\r\n, 21.2 , 52.1 ,,,mazowieckie,LAKE, Jezioro ,WA-1,RZGW\r\n`;

    const [record] = parseWaterCsv(csv);

    expect(record).toEqual({
      row: 2,
      values: containing({
        source: 'RZGW',
        name: 'Jezioro',
        lat: '52.1',
        lng: '21.2',
      }),
    });
  });

  it('numbers rows by the line in the file across empty lines and multi-line fields', () => {
    const csv = `${HEADER}\n\nRZGW,A,"Jezioro\nDuże",LAKE,mazowieckie,,,52,21,\nRZGW,B,Staw,POND,mazowieckie,,,52,21,\n`;

    expect(parseWaterCsv(csv).map((record) => record.row)).toEqual([3, 5]);
  });

  it('skips rows of bare commas left by spreadsheets', () => {
    const csv = `${HEADER}\nRZGW,A,Staw,POND,mazowieckie,,,52,21,\n,,,,,,,,,\n , , ,,,,,,,\n`;

    expect(parseWaterCsv(csv)).toHaveLength(1);
  });

  it('reports a row with a wrong number of fields without failing the file', () => {
    const csv = `${HEADER}\nRZGW,WA-1,Jezioro\nRZGW,WA-2,Staw,POND,mazowieckie,,,52,21,\n`;

    const records = parseWaterCsv(csv);

    expect(records[0]).toEqual({ row: 2, error: 'expected 10 fields, got 3' });
    expect(records[1]).toMatchObject({ row: 3, values: { sourceRef: 'WA-2' } });
  });

  it.each([
    ['an empty file', ''],
    ['a missing column', 'source,sourceRef,name\nRZGW,1,X'],
    ['an unknown column', `${HEADER},comment\n`],
    ['a duplicated column', `${HEADER},name\n`],
    ['an unclosed quote', `${HEADER}\nRZGW,"WA-1,Jezioro`],
  ])('rejects %s as a whole', (_case, csv) => {
    expect(() => parseWaterCsv(csv)).toThrow(WaterCsvFormatError);
  });

  it(`rejects more than ${WATER_CSV_MAX_ROWS} rows`, () => {
    const row = 'RZGW,WA,Staw,POND,mazowieckie,,,52,21,';
    const csv = [HEADER, ...Array<string>(WATER_CSV_MAX_ROWS + 1).fill(row)].join('\n');

    expect(() => parseWaterCsv(csv)).toThrow(`at most ${WATER_CSV_MAX_ROWS} rows`);
  });
});

describe('validateWaterRow', () => {
  it('returns a row to geocode when lat and lng are empty', () => {
    expect(validateWaterRow(valid)).toEqual({
      row: {
        source: 'RZGW',
        sourceRef: 'WA-123',
        name: 'Zalew Zegrzyński',
        type: 'RESERVOIR',
        region: 'mazowieckie',
        externalOwnerName: 'RZGW Warszawa',
        externalInfoUrl: 'https://www.gov.pl/web/wody-polskie',
        position: { geocodeQuery: 'Zalew Zegrzyński, mazowieckie' },
      },
    });
  });

  it('uses the given coordinates and turns empty optional fields into null', () => {
    const result = validateWaterRow({
      ...valid,
      externalOwnerName: '',
      externalInfoUrl: '',
      lat: '52.4875',
      lng: '21.0102',
      geocodeQuery: '',
    });

    expect(result).toEqual({
      row: containing({
        externalOwnerName: null,
        externalInfoUrl: null,
        position: { lat: 52.4875, lng: 21.0102 },
      }),
    });
  });

  it.each<[string, Partial<Record<WaterCsvColumn, string>>, string]>([
    ['a region outside REGIONS', { region: 'Mazowsze' }, 'region: must be a voivodeship'],
    ['a region in upper case', { region: 'Mazowieckie' }, 'region:'],
    [
      'a javascript: URL',
      { externalInfoUrl: 'javascript:alert(1)' },
      'externalInfoUrl: must be an http(s) URL',
    ],
    ['an ftp URL', { externalInfoUrl: 'ftp://rzgw.example/list' }, 'externalInfoUrl:'],
    ['a URL without a scheme', { externalInfoUrl: 'www.pzw.org.pl' }, 'externalInfoUrl:'],
    ['the USER source', { source: 'USER' }, 'source: must be one of RZGW, PZW, OSM, MANUAL'],
    ['an unknown type', { type: 'SEA' }, 'type: must be one of'],
    ['an empty name', { name: '' }, 'name: is required'],
    ['an empty sourceRef', { sourceRef: '' }, 'sourceRef: is required'],
    ['lat without lng', { lat: '52.1' }, 'lat: lat and lng go together'],
    ['a decimal comma', { lat: '52,1', lng: '21,0' }, 'lat: must be a decimal number'],
    ['swapped coordinates', { lat: '21.01', lng: '52.23' }, 'lat: lat/lng must lie in Poland'],
    [
      'neither coordinates nor a query',
      { geocodeQuery: '' },
      'geocodeQuery: is required when lat and lng are empty',
    ],
  ])('rejects %s', (_case, change, error) => {
    const result = validateWaterRow({ ...valid, ...change });

    expect(result).toEqual({ error: expect.stringContaining(error) as unknown });
  });

  it('names every bad field', () => {
    const result = validateWaterRow({ ...valid, region: 'x', type: 'SEA' });

    expect('error' in result && result.error.split('; ')).toHaveLength(2);
  });
});
