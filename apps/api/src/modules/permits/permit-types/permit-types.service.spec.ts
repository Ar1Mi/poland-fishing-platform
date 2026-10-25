import { changedFields, lockedChanges } from './permit-types.service';

const WATER_A = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e6f';
const WATER_B = '7e8f9a0b-1c2d-4e3f-8a5b-6c7d8e9f0a1b';

const stored = {
  name: 'Dzienne',
  durationDays: 1,
  priceGrosze: 2500,
  discountKind: 'NONE' as const,
  isActive: true,
  waters: [{ id: WATER_A }, { id: WATER_B }],
};

describe('changedFields', () => {
  it('finds nothing in a form sent back unchanged', () => {
    expect(
      changedFields(stored, {
        name: 'Dzienne',
        durationDays: 1,
        priceGrosze: 2500,
        discountKind: 'NONE',
        isActive: true,
        // Another order is the same set of waters.
        waterIds: [WATER_B, WATER_A],
      }),
    ).toEqual([]);
  });

  it('ignores fields that are not sent', () => {
    expect(changedFields(stored, { priceGrosze: 3000 })).toEqual(['priceGrosze']);
  });

  it('sees a water removed, added or replaced', () => {
    expect(changedFields(stored, { waterIds: [WATER_A] })).toEqual(['waterIds']);
    expect(
      changedFields({ ...stored, waters: [{ id: WATER_A }] }, { waterIds: [WATER_A, WATER_B] }),
    ).toEqual(['waterIds']);
    expect(
      changedFields({ ...stored, waters: [{ id: WATER_A }] }, { waterIds: [WATER_B] }),
    ).toEqual(['waterIds']);
  });

  it('lists every changed field', () => {
    expect(
      changedFields(stored, {
        name: 'Dzienne nocne',
        durationDays: 2,
        discountKind: 'JUNIOR',
        isActive: false,
      }),
    ).toEqual(['name', 'durationDays', 'discountKind', 'isActive']);
  });
});

describe('lockedChanges', () => {
  const changed = [
    'name',
    'durationDays',
    'priceGrosze',
    'discountKind',
    'waterIds',
    'isActive',
  ] as const;

  it('locks nothing while the type has no permits', () => {
    expect(lockedChanges({ _count: { permits: 0 } }, [...changed])).toEqual([]);
  });

  it('keeps the duration, the discount and the waters of a sold type', () => {
    expect(lockedChanges({ _count: { permits: 1 } }, [...changed])).toEqual([
      'durationDays',
      'discountKind',
      'waterIds',
    ]);
  });

  it('lets a sold type change its name, price and activity', () => {
    expect(lockedChanges({ _count: { permits: 3 } }, ['name', 'priceGrosze', 'isActive'])).toEqual(
      [],
    );
  });
});
