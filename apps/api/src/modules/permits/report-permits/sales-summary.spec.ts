import { type SoldPermitRow, summarizeSales } from './sales-summary';

const DAILY = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Dzienne' };
const YEARLY = { id: 'a0000000-0000-4000-8000-000000000002', name: 'Roczne' };

const sold = (data: Partial<SoldPermitRow> = {}): SoldPermitRow => ({
  permitType: DAILY,
  createdAt: new Date('2026-10-06T08:00:00.000Z'),
  pricePaidGrosze: 2500,
  revoked: false,
  ...data,
});

describe('summarizeSales', () => {
  it('sums the count and the revenue, revoked permits included and counted apart', () => {
    const summary = summarizeSales(
      [sold(), sold({ pricePaidGrosze: 3000 }), sold({ revoked: true, pricePaidGrosze: 1500 })],
      { from: '2026-10-01', to: '2026-10-31' },
    );

    expect(summary).toMatchObject({
      count: 3,
      revenueGrosze: 7000,
      revokedCount: 1,
      revokedGrosze: 1500,
    });
  });

  it('groups by permit type, highest revenue first', () => {
    const summary = summarizeSales(
      [
        sold(),
        sold(),
        sold({ permitType: YEARLY, pricePaidGrosze: 30000, revoked: true }),
        sold({ revoked: true }),
      ],
      { from: '2026-10-01', to: '2026-10-31' },
    );

    expect(summary.byPermitType).toEqual([
      { permitType: YEARLY, count: 1, revenueGrosze: 30000, revokedCount: 1 },
      { permitType: DAILY, count: 3, revenueGrosze: 7500, revokedCount: 1 },
    ]);
  });

  it('orders types of equal revenue by count, then by Polish name', () => {
    const zloty = { id: 'a0000000-0000-4000-8000-000000000003', name: 'Złote' };
    const zero = { id: 'a0000000-0000-4000-8000-000000000004', name: 'Zero' };
    const summary = summarizeSales(
      [
        sold({ permitType: zloty, pricePaidGrosze: 1000 }),
        sold({ permitType: zero, pricePaidGrosze: 1000 }),
        sold({ permitType: YEARLY, pricePaidGrosze: 500 }),
        sold({ permitType: YEARLY, pricePaidGrosze: 500 }),
      ],
      { from: '2026-10-01', to: '2026-10-31' },
    );

    expect(summary.byPermitType.map((type) => type.permitType.name)).toEqual([
      'Roczne',
      'Zero',
      'Złote',
    ]);
  });

  it('fills every month of the period, the empty ones with zeros', () => {
    const summary = summarizeSales([sold({ createdAt: new Date('2026-02-10T10:00:00.000Z') })], {
      from: '2026-01-15',
      to: '2026-03-15',
    });

    expect(summary.byMonth).toEqual([
      { month: '2026-01', count: 0, revenueGrosze: 0 },
      { month: '2026-02', count: 1, revenueGrosze: 2500 },
      { month: '2026-03', count: 0, revenueGrosze: 0 },
    ]);
  });

  it('puts a purchase into the Warsaw month, not the UTC one', () => {
    // 31 January 23:30 UTC is already 1 February 00:30 in Warsaw.
    const summary = summarizeSales([sold({ createdAt: new Date('2026-01-31T23:30:00.000Z') })], {
      from: '2026-01-01',
      to: '2026-02-28',
    });

    expect(summary.byMonth.map(({ month, count }) => [month, count])).toEqual([
      ['2026-01', 0],
      ['2026-02', 1],
    ]);
  });

  it('is all zeros for a period without sales', () => {
    expect(summarizeSales([], { from: '2026-10-06', to: '2026-10-06' })).toEqual({
      count: 0,
      revenueGrosze: 0,
      revokedCount: 0,
      revokedGrosze: 0,
      byPermitType: [],
      byMonth: [{ month: '2026-10', count: 0, revenueGrosze: 0 }],
    });
  });

  it('refuses a purchase outside the period: the query and the buckets disagree', () => {
    expect(() =>
      summarizeSales([sold({ createdAt: new Date('2026-11-01T08:00:00.000Z') })], {
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).toThrow(RangeError);
  });
});
