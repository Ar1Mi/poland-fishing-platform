import {
  type CatchContext,
  type EffectiveRule,
  type PermitSnapshot,
  resolveEffectiveRule,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { CatchPermitsService } from '../permits/catch-permits/catch-permits.service';
import { SpeciesService } from '../rules/species.service';
import { SpeciesRulesService } from '../rules/species-rules.service';
import { WatersService } from '../waters/waters.service';

/** A catch as sent or stored: what the CatchValidator and the references need. */
export interface CatchData {
  /** Exactly one of `permitId` and `externalPermitId` is set. */
  permitId: string | null;
  externalPermitId: string | null;
  fishingWaterId: string;
  speciesId: string;
  caughtAt: Date;
  lengthCm: number;
  weightG: number | null;
  kept: boolean;
}

export type CatchReference = 'permitId' | 'externalPermitId' | 'fishingWaterId' | 'speciesId';

/** The context of a catch without what depends on the register and the clock. */
export type LoadedContext = Omit<CatchContext, 'sameDayKept' | 'now'>;

export interface LoadedContexts {
  /** References that do not exist; a permit also when it is of someone else. */
  unknown: { index: number; field: CatchReference }[];
  /** Context of the catch at `index`; only for a catch without unknown references. */
  contextOf(index: number): LoadedContext;
}

/** No rule of any level for the species: nothing restricts it but BR-01, BR-06 and BR-10. */
const NO_RULE: EffectiveRule = resolveEffectiveRule([]);

/**
 * Gathers from the other modules what the CatchValidator needs for a batch of catches, with a
 * few queries for the whole batch: the permits of the user, species, waters and their rules.
 */
@Injectable()
export class CatchContextLoader {
  constructor(
    private readonly permits: CatchPermitsService,
    private readonly species: SpeciesService,
    private readonly rules: SpeciesRulesService,
    private readonly waters: WatersService,
  ) {}

  async load(userId: string, catches: CatchData[]): Promise<LoadedContexts> {
    const ids = (pick: (fish: CatchData) => string | null): string[] => [
      ...new Set(catches.flatMap((fish) => pick(fish) ?? [])),
    ];
    const waterIds = ids((fish) => fish.fishingWaterId);
    const [permits, protection, waterNames, onWaters, general] = await Promise.all([
      this.permits.find(userId, {
        permitIds: ids((fish) => fish.permitId),
        externalPermitIds: ids((fish) => fish.externalPermitId),
      }),
      this.species.findProtection(ids((fish) => fish.speciesId)),
      this.waters.findNames(waterIds),
      this.rules.effectiveOnWaters(waterIds),
      // An external permit is checked against the general rules only (02-business-rules.md).
      catches.some((fish) => fish.externalPermitId !== null)
        ? this.rules.effectiveGeneral()
        : new Map<string, EffectiveRule>(),
    ]);
    const permitOf = (fish: CatchData): PermitSnapshot | undefined =>
      fish.permitId !== null
        ? permits.platform.get(fish.permitId)
        : permits.external.get(fish.externalPermitId ?? '');

    const unknown = catches.flatMap((fish, index) => {
      const missing: CatchReference[] = [];
      if (!permitOf(fish)) {
        missing.push(fish.permitId !== null ? 'permitId' : 'externalPermitId');
      }
      if (!waterNames.has(fish.fishingWaterId)) {
        missing.push('fishingWaterId');
      }
      if (!protection.has(fish.speciesId)) {
        missing.push('speciesId');
      }
      return missing.map((field) => ({ index, field }));
    });

    return {
      unknown,
      contextOf(index) {
        const fish = catches[index]!;
        const permit = permitOf(fish);
        const isProtected = protection.get(fish.speciesId);
        if (!permit || isProtected === undefined) {
          throw new Error(`Catch ${index} has unknown references`);
        }
        const rules = fish.externalPermitId !== null ? general : onWaters.get(fish.fishingWaterId);
        return {
          catch: {
            speciesId: fish.speciesId,
            fishingWaterId: fish.fishingWaterId,
            caughtAt: fish.caughtAt,
            lengthCm: fish.lengthCm,
            weightG: fish.weightG,
            kept: fish.kept,
          },
          permit,
          species: { id: fish.speciesId, isProtected },
          effectiveRule: rules?.get(fish.speciesId) ?? NO_RULE,
        };
      },
    };
  }
}
