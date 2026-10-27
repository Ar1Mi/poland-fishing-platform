import { DiscountKind, EffectivePermitStatus } from '@lowisko/shared';
import { type PermitPdfInput, PermitPdfService, permitPdfContent } from './permit-pdf.service';

const input = (changes: Partial<PermitPdfInput> = {}): PermitPdfInput => ({
  permit: {
    id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
    number: 'ZW-2026-000123',
    status: EffectivePermitStatus.SCHEDULED,
    validFrom: '2026-10-10',
    validTo: '2026-10-16',
    pricePaidGrosze: 12_550,
    permitType: {
      id: 'type',
      name: 'Tygodniowe',
      durationDays: 7,
      discountKind: DiscountKind.NONE,
    },
    organization: { id: 'org', name: 'PZW Okręg Mazowiecki' },
    createdAt: '2026-10-06T15:20:00.000Z',
    qrToken: 'token',
  },
  holder: { firstName: 'Józef', lastName: 'Żółć', birthDate: '1980-03-09', anglerCardNo: null },
  waterNames: ['Jezioro Łańskie', 'Zalew Zegrzyński'],
  verifyUrl: 'http://localhost:5173/verify/token',
  generatedAt: new Date('2026-10-06T15:20:00.000Z'),
  ...changes,
});

describe('permitPdfContent', () => {
  it('lists holder, issuer, type, Polish dates and the price in złoty', () => {
    expect(permitPdfContent(input()).rows).toEqual([
      ['Posiadacz', 'Józef Żółć'],
      ['Data urodzenia', '09.03.1980'],
      ['Wydające', 'PZW Okręg Mazowiecki'],
      ['Rodzaj', 'Tygodniowe'],
      ['Ważne od', '10.10.2026'],
      ['Ważne do', '16.10.2026 włącznie'],
      ['Opłata', '125,50 zł'],
    ]);
  });

  it('adds the angler card number when the holder has one', () => {
    const { rows } = permitPdfContent(
      input({
        holder: { firstName: 'A', lastName: 'B', birthDate: '1980-03-09', anglerCardNo: 'KW/123' },
      }),
    );

    expect(rows).toContainEqual(['Nr karty wędkarskiej', 'KW/123']);
  });

  it('names the discount so the inspector knows to check the age', () => {
    const base = input();
    const { rows } = permitPdfContent({
      ...base,
      permit: {
        ...base.permit,
        permitType: {
          ...base.permit.permitType,
          name: 'Dzienne',
          discountKind: DiscountKind.JUNIOR,
        },
      },
    });

    expect(rows).toContainEqual(['Rodzaj', 'Dzienne (ulgowe — do 16 lat)']);
  });

  it('dates the footer in Warsaw time', () => {
    expect(permitPdfContent(input()).footer).toContain('6.10.2026, 17:20');
  });

  it('keeps the waters and the verification URL', () => {
    const content = permitPdfContent(input());

    expect(content.waterNames).toEqual(['Jezioro Łańskie', 'Zalew Zegrzyński']);
    expect(content.verifyUrl).toBe('http://localhost:5173/verify/token');
  });
});

describe('PermitPdfService', () => {
  it('renders one PDF page with the Onest font embedded', async () => {
    const pdf = (await new PermitPdfService().render(input())).toString('latin1');

    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf).toMatch(/\/BaseFont \/\w+\+Onest-Regular/);
    expect(pdf).toMatch(/\/BaseFont \/\w+\+Onest-Bold/);
  });
});
