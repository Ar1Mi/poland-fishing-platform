import type { CatchCount } from '../catches/report-catches/report-catches.service';
import { summarizeCatches } from './catch-stats';

const PIKE = 'c0000000-0000-4000-8000-000000000001';
const PERCH = 'c0000000-0000-4000-8000-000000000002';
const ZEGRZE = { id: 'd0000000-0000-4000-8000-000000000001', name: 'Zalew Zegrzyński' };
const WISLA = { id: 'd0000000-0000-4000-8000-000000000002', name: 'Wisła' };

const counted = (data: Partial<CatchCount>): CatchCount => ({
  speciesId: PIKE,
  water: ZEGRZE,
  kept: true,
  count: 1,
  ...data,
});

describe('summarizeCatches', () => {
  it('totals kept and released catches', () => {
    const stats = summarizeCatches([
      counted({ count: 3 }),
      counted({ kept: false, count: 2 }),
      counted({ speciesId: PERCH, water: WISLA, kept: false, count: 5 }),
    ]);

    expect(stats).toMatchObject({ count: 10, keptCount: 3, releasedCount: 7 });
  });

  it('folds the waters into species and the species into waters, most caught first', () => {
    const stats = summarizeCatches([
      counted({ count: 3 }),
      counted({ water: WISLA, kept: false, count: 1 }),
      counted({ speciesId: PERCH, water: WISLA, count: 2 }),
      counted({ speciesId: PERCH, water: WISLA, kept: false, count: 4 }),
    ]);

    expect(stats.bySpecies).toEqual([
      { speciesId: PERCH, count: 6, keptCount: 2 },
      { speciesId: PIKE, count: 4, keptCount: 3 },
    ]);
    expect(stats.byWater).toEqual([
      { water: WISLA, count: 7, keptCount: 2 },
      { water: ZEGRZE, count: 3, keptCount: 3 },
    ]);
  });

  it('orders waters caught as often by Polish name', () => {
    const lake = { id: 'd0000000-0000-4000-8000-000000000003', name: 'Łaśko' };
    const stats = summarizeCatches([counted({ water: lake }), counted({ water: WISLA })]);

    expect(stats.byWater.map(({ water }) => water.name)).toEqual(['Łaśko', 'Wisła']);
  });

  it('is all zeros without catches', () => {
    expect(summarizeCatches([])).toEqual({
      count: 0,
      keptCount: 0,
      releasedCount: 0,
      bySpecies: [],
      byWater: [],
    });
  });
});
