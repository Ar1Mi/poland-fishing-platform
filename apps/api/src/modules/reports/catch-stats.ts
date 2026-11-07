import type { CatchCount } from '../catches/report-catches/report-catches.service';

export interface SpeciesCatches {
  speciesId: string;
  count: number;
  keptCount: number;
}

export interface WaterCatches {
  water: { id: string; name: string };
  count: number;
  keptCount: number;
}

/** Accepted catches of an organization's permits in a period (FR-19). */
export interface CatchStats {
  count: number;
  keptCount: number;
  releasedCount: number;
  /** Most caught first; the client names the species in its language. */
  bySpecies: SpeciesCatches[];
  /** Most caught first. */
  byWater: WaterCatches[];
}

const byName = new Intl.Collator('pl');

/** Folds the counts by species, water and kept into totals by species and by water. */
export function summarizeCatches(counts: CatchCount[]): CatchStats {
  const species = new Map<string, SpeciesCatches>();
  const waters = new Map<string, WaterCatches>();
  const stats: CatchStats = {
    count: 0,
    keptCount: 0,
    releasedCount: 0,
    bySpecies: [],
    byWater: [],
  };
  for (const { speciesId, water, kept, count } of counts) {
    const keptCount = kept ? count : 0;
    stats.count += count;
    stats.keptCount += keptCount;
    stats.releasedCount += count - keptCount;

    const ofSpecies = species.get(speciesId) ?? { speciesId, count: 0, keptCount: 0 };
    ofSpecies.count += count;
    ofSpecies.keptCount += keptCount;
    species.set(speciesId, ofSpecies);

    const ofWater = waters.get(water.id) ?? { water, count: 0, keptCount: 0 };
    ofWater.count += count;
    ofWater.keptCount += keptCount;
    waters.set(water.id, ofWater);
  }
  stats.bySpecies = [...species.values()].sort(
    (a, b) => b.count - a.count || a.speciesId.localeCompare(b.speciesId),
  );
  stats.byWater = [...waters.values()].sort(
    (a, b) =>
      b.count - a.count ||
      byName.compare(a.water.name, b.water.name) ||
      a.water.id.localeCompare(b.water.id),
  );
  return stats;
}
