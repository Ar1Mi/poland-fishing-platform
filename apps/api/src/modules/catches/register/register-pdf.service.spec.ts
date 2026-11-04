import { CatchErrorCode, CatchSyncStatus, EffectivePermitStatus } from '@lowisko/shared';
import type { CatchDto } from '../dto/catch.dto';
import {
  type RegisterPdfInput,
  RegisterPdfService,
  registerPdfContent,
} from './register-pdf.service';

const KARP = 'species-karp';
const SZCZUPAK = 'species-szczupak';

const fish = (changes: Partial<CatchDto> = {}): CatchDto => ({
  id: 'catch',
  clientId: 'client',
  permitId: null,
  externalPermitId: 'external',
  water: { id: 'water-1', name: 'Jezioro Wąsosze' },
  speciesId: KARP,
  caughtAt: '2026-06-01T10:00:00.000Z',
  lengthCm: 42,
  weightG: 1250,
  kept: true,
  lat: null,
  lng: null,
  status: CatchSyncStatus.ACCEPTED,
  violations: [],
  editableUntil: '2026-06-02T22:00:00.000Z',
  createdAt: '2026-06-01T10:00:00.000Z',
  ...changes,
});

const input = (changes: Partial<RegisterPdfInput> = {}): RegisterPdfInput => ({
  season: 2026,
  permit: {
    id: 'external',
    issuerName: 'Gospodarstwo Rybackie Wąsosze',
    number: '123/2026',
    status: EffectivePermitStatus.ACTIVE,
    validFrom: '2026-05-01',
    validTo: '2026-12-31',
    waters: [
      { id: 'water-1', name: 'Jezioro Wąsosze' },
      { id: 'water-2', name: 'Staw Dolny' },
    ],
    photoType: null,
    createdAt: '2026-05-01T08:00:00.000Z',
  },
  holder: { firstName: 'Józef', lastName: 'Żółć', anglerCardNo: null },
  catches: [fish()],
  speciesNames: new Map([
    [KARP, 'Karp'],
    [SZCZUPAK, 'Szczupak'],
  ]),
  generatedAt: new Date('2026-11-04T09:30:00.000Z'),
  ...changes,
});

describe('registerPdfContent', () => {
  it('names the angler, the issuer, the number and the dates of the permit, without birth date', () => {
    expect(registerPdfContent(input()).rows).toEqual([
      ['Wędkarz', 'Józef Żółć'],
      ['Zezwolenie wydał', 'Gospodarstwo Rybackie Wąsosze'],
      ['Nr zezwolenia', '123/2026'],
      ['Ważne', '01.05.2026 – 31.12.2026'],
    ]);
  });

  it('adds the angler card number and leaves out a missing permit number', () => {
    const base = input();
    const { rows } = registerPdfContent({
      ...base,
      holder: { ...base.holder, anglerCardNo: 'KW/123' },
      permit: { ...base.permit, number: null },
    });

    expect(rows).toContainEqual(['Nr karty wędkarskiej', 'KW/123']);
    expect(rows.map(([label]) => label)).not.toContain('Nr zezwolenia');
  });

  it('has the columns of the paper register and one row per fish', () => {
    const content = registerPdfContent(
      input({
        catches: [
          fish(),
          fish({
            speciesId: SZCZUPAK,
            lengthCm: 64,
            weightG: null,
            water: { id: 'water-2', name: 'Staw Dolny' },
          }),
        ],
      }),
    );

    expect(content.columns).toEqual([
      'Lp.',
      'Data',
      'Łowisko',
      'Gatunek',
      'Ilość (szt.)',
      'Długość (cm)',
      'Waga (kg)',
      'Uwagi',
    ]);
    expect(content.lines).toEqual([
      ['1', '01.06.2026', 'Jezioro Wąsosze', 'Karp', '1', '42', '1,25', ''],
      ['2', '01.06.2026', 'Staw Dolny', 'Szczupak', '1', '64', '—', ''],
    ]);
    expect(content.total).toBe('Razem ryb zabranych: 2 szt.');
    expect(content.empty).toBeNull();
  });

  it('dates a fish by its Warsaw day: 23:30 UTC on 31 May is 1 June', () => {
    const { lines } = registerPdfContent(
      input({ catches: [fish({ caughtAt: '2026-05-31T23:30:00.000Z' })] }),
    );

    expect(lines[0]![1]).toBe('01.06.2026');
  });

  it('marks a rejected fish as a violation, with the reasons in Polish', () => {
    const content = registerPdfContent(
      input({
        catches: [
          fish(),
          fish({
            status: CatchSyncStatus.REJECTED,
            lengthCm: 30,
            violations: [
              {
                code: CatchErrorCode.BELOW_MIN_LENGTH,
                ruleId: 'BR-02',
                details: { minLengthCm: 35 },
              },
              { code: CatchErrorCode.DAILY_COUNT_LIMIT, ruleId: 'BR-04' },
            ],
          }),
        ],
      }),
    );

    expect(content.lines[1]![7]).toBe(
      'naruszenie: poniżej wymiaru ochronnego, ponad dzienny limit sztuk',
    );
    expect(content.total).toBe('Razem ryb zabranych: 2 szt., w tym z naruszeniem zasad: 1 szt.');
  });

  it('says so when the season has no kept fish', () => {
    const content = registerPdfContent(input({ catches: [] }));

    expect(content.lines).toEqual([]);
    expect(content.empty).toBe('Brak ryb zabranych na tym zezwoleniu w sezonie 2026.');
  });

  it('dates the footer in Warsaw time and lists the waters', () => {
    const content = registerPdfContent(input());

    expect(content.footer).toContain('4.11.2026, 10:30');
    expect(content.waterNames).toEqual(['Jezioro Wąsosze', 'Staw Dolny']);
  });
});

describe('RegisterPdfService', () => {
  it('renders the Onest font and breaks a long season over pages', async () => {
    const catches = Array.from({ length: 80 }, (_, index) => fish({ id: `catch-${index}` }));
    const pdf = (await new RegisterPdfService().render(input({ catches }))).toString('latin1');

    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
    expect(pdf).toMatch(/\/BaseFont \/\w+\+Onest-Regular/);
    expect(pdf).toMatch(/\/BaseFont \/\w+\+Onest-Bold/);
  });

  it('renders an empty season on one page', async () => {
    const pdf = (await new RegisterPdfService().render(input({ catches: [] }))).toString('latin1');

    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
});
