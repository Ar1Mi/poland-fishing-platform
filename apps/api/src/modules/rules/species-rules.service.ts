import {
  type EffectiveRule,
  ErrorCode,
  RULE_PARAMETERS,
  type RuleParameter,
  type RuleParameters,
  WaterStatus,
  ineffectiveParameters,
  resolveEffectiveRules,
  ruleParametersSchema,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, type SpeciesRule } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { WatersService } from '../waters/waters.service';
import type {
  CreateGeneralRuleDto,
  CreateOrgRuleDto,
  EffectiveRuleDto,
  SpeciesRuleDto,
  UpdateSpeciesRuleDto,
} from './dto/species-rule.dto';

/**
 * Which rules a caller manages: the general ones (super admin) or those of one organization,
 * both its own and those of its waters. A rule outside the scope is as unknown as a missing one.
 */
export type RuleScope = { kind: 'general' } | { kind: 'organization'; organizationId: string };

/** Fishing rules of the three levels (FR-16, ADR-0008) and their merge for a water. */
@Injectable()
export class SpeciesRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waters: WatersService,
    private readonly audit: AuditService,
  ) {}

  /** Rules of the scope by species name; within a species the organization rule first, then waters. */
  async list(scope: RuleScope): Promise<SpeciesRuleDto[]> {
    const rules = await this.prisma.speciesRule.findMany({
      where: scopeFilter(scope),
      include: { species: { select: { namePl: true } } },
    });
    const dtos = await this.toDtos(rules);
    const speciesName = new Map(rules.map((rule) => [rule.id, rule.species.namePl]));
    return dtos.sort(
      (a, b) =>
        speciesName.get(a.id)!.localeCompare(speciesName.get(b.id)!, 'pl') ||
        a.speciesId.localeCompare(b.speciesId) ||
        Number(a.water !== null) - Number(b.water !== null) ||
        (a.water?.name ?? '').localeCompare(b.water?.name ?? '', 'pl') ||
        a.id.localeCompare(b.id),
    );
  }

  async get(scope: RuleScope, id: string): Promise<SpeciesRuleDto> {
    const [dto] = await this.toDtos([await this.find(scope, id)]);
    return dto!;
  }

  async create(
    scope: RuleScope,
    actorId: string,
    dto: CreateGeneralRuleDto | CreateOrgRuleDto,
  ): Promise<SpeciesRuleDto> {
    const parameters = validParameters(parametersOf(dto));
    const level = await this.levelFor(scope, dto);
    await this.assertSpeciesExists(dto.speciesId);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const created = await tx.speciesRule.create({
          data: { speciesId: dto.speciesId, ...level, ...parameters },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'RULE_CREATED',
          entity: 'SpeciesRule',
          entityId: created.id,
          diff: { speciesId: dto.speciesId, ...level, ...parameters },
        });
        return created.id;
      });
      return await this.get(scope, id);
    } catch (error) {
      // `rule_one_general`: also two creations racing for the same species.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError(
          ErrorCode.RULE_ALREADY_EXISTS,
          { speciesId: dto.speciesId },
          'The species already has a general rule',
        );
      }
      throw error;
    }
  }

  /** Changes the sent parameters (`null` removes one); species and level stay. */
  async update(
    scope: RuleScope,
    actorId: string,
    id: string,
    dto: UpdateSpeciesRuleDto,
  ): Promise<SpeciesRuleDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForChange(tx, scope, id);
      const next = validParameters({ ...parametersOf(current), ...definedParameters(dto) });
      const changed = RULE_PARAMETERS.filter((parameter) => next[parameter] !== current[parameter]);
      if (changed.length === 0) {
        return;
      }
      await tx.speciesRule.update({
        where: { id },
        data: Object.fromEntries(changed.map((parameter) => [parameter, next[parameter]])),
      });
      await this.audit.record(tx, {
        actorId,
        action: 'RULE_UPDATED',
        entity: 'SpeciesRule',
        entityId: id,
        diff: Object.fromEntries(
          changed.map((parameter) => [
            parameter,
            { from: current[parameter], to: next[parameter] },
          ]),
        ),
      });
    });
    return this.get(scope, id);
  }

  async remove(scope: RuleScope, actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockForChange(tx, scope, id);
      await tx.speciesRule.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'RULE_DELETED',
        entity: 'SpeciesRule',
        entityId: id,
        diff: {
          speciesId: current.speciesId,
          organizationId: current.organizationId,
          fishingWaterId: current.fishingWaterId,
          ...parametersOf(current),
        },
      });
    });
  }

  /**
   * The effective rule per species for a water (docs/02-business-rules.md): the general rules,
   * and on a connected water those of its current organization and of the water itself — also
   * while the organization is blocked. Species without any rule are left out; by species name.
   * Unknown or unpublished water → NOT_FOUND.
   */
  async effectiveForWater(waterId: string): Promise<EffectiveRuleDto[]> {
    const water = await this.waters.get(waterId);
    const levels: Prisma.SpeciesRuleWhereInput[] = [GENERAL_LEVEL];
    if (water.status === WaterStatus.CONNECTED && water.organization) {
      levels.push(ownerLevels(water.organization.id, [waterId]));
    }
    const rows = await this.prisma.speciesRule.findMany({
      where: { OR: levels },
      include: { species: { select: { namePl: true } } },
    });
    const speciesName = new Map(rows.map((row) => [row.speciesId, row.species.namePl]));
    return [...resolveEffectiveRules(rows)]
      .map(([speciesId, rule]) => ({ speciesId, ...rule }))
      .sort(
        (a, b) =>
          speciesName.get(a.speciesId)!.localeCompare(speciesName.get(b.speciesId)!, 'pl') ||
          a.speciesId.localeCompare(b.speciesId),
      );
  }

  /**
   * What a catch on each of `waterIds` is checked against (T-18): the effective rule per species,
   * merged like `effectiveForWater` — also for unpublished waters, a catch may be on any. Only
   * species with a rule are in a water's map; for the others no rule restricts anything.
   */
  async effectiveOnWaters(waterIds: string[]): Promise<Map<string, Map<string, EffectiveRule>>> {
    const owners = await this.waters.findOwners(waterIds);
    const levels: Prisma.SpeciesRuleWhereInput[] = [GENERAL_LEVEL];
    for (const organizationId of new Set(owners.values())) {
      levels.push(
        ownerLevels(
          organizationId,
          waterIds.filter((id) => owners.get(id) === organizationId),
        ),
      );
    }
    const rows = await this.prisma.speciesRule.findMany({ where: { OR: levels } });
    return new Map(
      waterIds.map((waterId) => [
        waterId,
        resolveEffectiveRules(
          rows.filter(
            (row) =>
              row.organizationId === null ||
              (row.organizationId === owners.get(waterId) &&
                (row.fishingWaterId === null || row.fishingWaterId === waterId)),
          ),
        ),
      ]),
    );
  }

  /** The general rules only, per species: what a catch on an external permit is checked against. */
  async effectiveGeneral(): Promise<Map<string, EffectiveRule>> {
    return resolveEffectiveRules(await this.prisma.speciesRule.findMany({ where: GENERAL_LEVEL }));
  }

  /**
   * Locks the rule row, then reads it. Two changes of one rule run one after the other: each
   * validates the merge with what the other wrote. Without the lock both pass validation on
   * the same old row and their writes together can leave half a closed period (the CHECK
   * fails: 500) or a rule that restricts nothing.
   */
  private async lockForChange(
    tx: Prisma.TransactionClient,
    scope: RuleScope,
    id: string,
  ): Promise<SpeciesRule> {
    // A row outside the scope is locked only for the moment it takes to answer NOT_FOUND.
    await tx.$queryRaw`SELECT "id" FROM "SpeciesRule" WHERE "id" = ${id}::uuid FOR UPDATE`;
    // A new statement after the lock sees what the change that held it committed (READ COMMITTED).
    return this.find(scope, id, tx);
  }

  private async find(
    scope: RuleScope,
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<SpeciesRule> {
    const rule = await client.speciesRule.findFirst({ where: { id, ...scopeFilter(scope) } });
    if (!rule) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Rule not found');
    }
    return rule;
  }

  /** Foreign keys of a new rule; a water must be connected to the organization. */
  private async levelFor(
    scope: RuleScope,
    dto: CreateGeneralRuleDto | CreateOrgRuleDto,
  ): Promise<{ organizationId: string | null; fishingWaterId: string | null }> {
    if (scope.kind === 'general') {
      return { organizationId: null, fishingWaterId: null };
    }
    const fishingWaterId = ('fishingWaterId' in dto && dto.fishingWaterId) || null;
    if (fishingWaterId) {
      const connected = await this.waters.findConnectedIds(scope.organizationId, [fishingWaterId]);
      if (!connected.has(fishingWaterId)) {
        throw validationFailed('fishingWaterId', 'water is not connected to the organization');
      }
    }
    return { organizationId: scope.organizationId, fishingWaterId };
  }

  private async assertSpeciesExists(speciesId: string): Promise<void> {
    const species = await this.prisma.species.findUnique({
      where: { id: speciesId },
      select: { id: true },
    });
    if (!species) {
      throw validationFailed('speciesId', 'species not found');
    }
  }

  private async toDtos(rules: SpeciesRule[]): Promise<SpeciesRuleDto[]> {
    const waterIds = [
      ...new Set(rules.flatMap((rule) => (rule.fishingWaterId ? [rule.fishingWaterId] : []))),
    ];
    const [names, higher] = await Promise.all([
      waterIds.length > 0 ? this.waters.findNames(waterIds) : new Map<string, string>(),
      this.higherLevels(rules),
    ]);
    return rules.map((rule) => ({
      id: rule.id,
      speciesId: rule.speciesId,
      water: rule.fishingWaterId
        ? { id: rule.fishingWaterId, name: names.get(rule.fishingWaterId) ?? '' }
        : null,
      ...parametersOf(rule),
      ineffective: ineffectiveParameters(
        rule,
        higher.filter(
          (row) => row.speciesId === rule.speciesId && row.id !== rule.id && isAbove(row, rule),
        ),
      ),
      updatedAt: rule.updatedAt.toISOString(),
    }));
  }

  /** General and organization-wide rules of the species of `rules`: the levels above them. */
  private higherLevels(rules: SpeciesRule[]): Promise<SpeciesRule[]> {
    const below = rules.filter((rule) => rule.organizationId !== null);
    if (below.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.speciesRule.findMany({
      where: {
        speciesId: { in: [...new Set(below.map((rule) => rule.speciesId))] },
        fishingWaterId: null,
        OR: [
          { organizationId: null },
          { organizationId: { in: [...new Set(below.map((rule) => rule.organizationId!))] } },
        ],
      },
    });
  }
}

/**
 * Whether `row` is a level above `rule`: the general rule is above an organization rule; the
 * general and the organization-wide rules of its organization are above a water rule.
 */
function isAbove(row: SpeciesRule, rule: SpeciesRule): boolean {
  if (rule.organizationId === null || row.fishingWaterId !== null) {
    return false;
  }
  return (
    row.organizationId === null ||
    (rule.fishingWaterId !== null && row.organizationId === rule.organizationId)
  );
}

const GENERAL_LEVEL: Prisma.SpeciesRuleWhereInput = { organizationId: null, fishingWaterId: null };

/**
 * Rules of the current owner of `waterIds` (connected to it): its own and those of these waters.
 * Rules of a former owner (organizationId of another one) do not apply.
 */
function ownerLevels(organizationId: string, waterIds: string[]): Prisma.SpeciesRuleWhereInput {
  return { organizationId, OR: [{ fishingWaterId: null }, { fishingWaterId: { in: waterIds } }] };
}

function scopeFilter(scope: RuleScope): Prisma.SpeciesRuleWhereInput {
  return scope.kind === 'general' ? GENERAL_LEVEL : { organizationId: scope.organizationId };
}

/** Every parameter, a missing one as `null`. */
function parametersOf(source: Partial<Record<RuleParameter, unknown>>): RuleParameters {
  return Object.fromEntries(
    RULE_PARAMETERS.map((parameter) => [parameter, source[parameter] ?? null]),
  ) as unknown as RuleParameters;
}

/** The parameters the update sends: `undefined` keeps the stored value, `null` clears it. */
function definedParameters(dto: UpdateSpeciesRuleDto): Partial<RuleParameters> {
  return Object.fromEntries(
    RULE_PARAMETERS.flatMap((parameter) =>
      dto[parameter] === undefined ? [] : [[parameter, dto[parameter]]],
    ),
  );
}

/**
 * The checks over parameters together (the DTO checks each alone): a rule restricts
 * something, a period has both days. A rule restricting nothing reports under `rule`.
 */
export function validParameters(parameters: RuleParameters): RuleParameters {
  const result = ruleParametersSchema.safeParse(parameters);
  if (result.success) {
    return result.data;
  }
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : 'rule';
    (fields[field] ??= []).push(issue.message);
  }
  throw new DomainError(ErrorCode.VALIDATION_FAILED, { fields }, 'Rule parameters are invalid');
}

function validationFailed(field: string, message: string): DomainError {
  return new DomainError(
    ErrorCode.VALIDATION_FAILED,
    { fields: { [field]: [`${field}: ${message}`] } },
    'Rule validation failed',
  );
}
