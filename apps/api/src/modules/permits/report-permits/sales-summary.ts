import { monthsOf, type StatsRange, warsawDate, type YearMonth } from '@lowisko/shared';

/** A sold permit (paid, maybe revoked since) as the statistics count it. */
export interface SoldPermitRow {
  permitType: { id: string; name: string };
  /** The purchase: a sale belongs to the Warsaw day it was bought on. */
  createdAt: Date;
  pricePaidGrosze: number;
  revoked: boolean;
}

export interface PermitTypeSales {
  permitType: { id: string; name: string };
  count: number;
  revenueGrosze: number;
  revokedCount: number;
}

export interface MonthSales {
  month: YearMonth;
  count: number;
  revenueGrosze: number;
}

/**
 * Sales of an organization in a period (FR-19). A revoked permit was paid, so it is a sale and
 * its price is in the revenue; how much of it went back is not known to the platform (a refund
 * is made outside it, T-23), so the revoked ones are also counted apart.
 */
export interface SalesSummary {
  count: number;
  revenueGrosze: number;
  revokedCount: number;
  revokedGrosze: number;
  /** Types that sold anything, highest revenue first. */
  byPermitType: PermitTypeSales[];
  /** Every month of the period, empty ones too: the chart has no gaps. */
  byMonth: MonthSales[];
}

const byName = new Intl.Collator('pl');

/** Sums the permits sold in `range`; rows are expected to be in it already. */
export function summarizeSales(rows: SoldPermitRow[], range: StatsRange): SalesSummary {
  const types = new Map<string, PermitTypeSales>();
  const months = new Map<YearMonth, MonthSales>(
    monthsOf(range).map((month) => [month, { month, count: 0, revenueGrosze: 0 }]),
  );
  const summary: SalesSummary = {
    count: 0,
    revenueGrosze: 0,
    revokedCount: 0,
    revokedGrosze: 0,
    byPermitType: [],
    byMonth: [],
  };
  for (const row of rows) {
    summary.count += 1;
    summary.revenueGrosze += row.pricePaidGrosze;
    if (row.revoked) {
      summary.revokedCount += 1;
      summary.revokedGrosze += row.pricePaidGrosze;
    }

    let type = types.get(row.permitType.id);
    if (!type) {
      type = { permitType: row.permitType, count: 0, revenueGrosze: 0, revokedCount: 0 };
      types.set(row.permitType.id, type);
    }
    type.count += 1;
    type.revenueGrosze += row.pricePaidGrosze;
    type.revokedCount += row.revoked ? 1 : 0;

    const month = months.get(warsawDate(row.createdAt).slice(0, 7));
    if (!month) {
      throw new RangeError(`Permit bought on ${row.createdAt.toISOString()} is outside the period`);
    }
    month.count += 1;
    month.revenueGrosze += row.pricePaidGrosze;
  }
  summary.byPermitType = [...types.values()].sort(
    (a, b) =>
      b.revenueGrosze - a.revenueGrosze ||
      b.count - a.count ||
      byName.compare(a.permitType.name, b.permitType.name) ||
      a.permitType.id.localeCompare(b.permitType.id),
  );
  summary.byMonth = [...months.values()];
  return summary;
}
